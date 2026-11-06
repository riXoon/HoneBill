# NestJS principles and templates

Read this when you need the *how* behind SKILL.md: a pattern, a template, or the reason for a rule. Targets NestJS 11 (Express 5 adapter), TypeScript, Prisma.

## Contents
1. [Mental model](#1-mental-model)
2. [Modules and dependency injection](#2-modules-and-dependency-injection)
3. [Controllers and DTOs](#3-controllers-and-dtos)
4. [Pipes and validation](#4-pipes-and-validation)
5. [Guards, decorators, authorization](#5-guards-custom-decorators-and-authorization)
6. [Interceptors](#6-interceptors)
7. [Exceptions and filters](#7-exceptions-and-filters)
8. [Configuration](#8-configuration)
9. [Persistence with Prisma](#9-persistence-with-prisma)
10. [Queues and background jobs](#10-queues-and-background-jobs-bullmq)
11. [Lifecycle, shutdown, health](#11-lifecycle-shutdown-and-health)
12. [Logging and observability](#12-logging-and-observability)
13. [Swagger / OpenAPI](#13-swagger--openapi)
14. [Testing](#14-testing)
15. [Express 5 / Nest 11 gotchas](#15-express-5--nest-11-gotchas)
16. [Anti-patterns](#16-anti-patterns)

---

## 1. Mental model

Nest is a DI container plus a request pipeline wrapped around Express (or Fastify). At boot it reads decorator metadata (`@Module`, `@Injectable`, `@Controller`), builds a provider graph, instantiates singletons in dependency order, runs lifecycle hooks, then maps routes. Everything idiomatic in Nest follows from that: **declare dependencies in constructors, declare cross-cutting behavior with decorators, and let the container wire it.**

Request order (memorize it, it explains most "why didn't my guard/pipe run" bugs):

```
Express middleware
  -> global prefix + route match
  -> Guards            (global -> controller -> route)
  -> Interceptors (before)
  -> Pipes             (global -> controller -> route -> param)
  -> Route handler
  -> Interceptors (after, reverse order)
  -> Exception filters (route -> controller -> global) on any thrown error
```

Consequences:
- Middleware registered with `app.use()` in `main.ts` runs before everything and even for unmatched routes.
- A guard sees the raw request (body not yet validated/transformed).
- A thrown error anywhere after route match (including guards and pipes) reaches the exception filters. Errors thrown *inside Express middleware* (e.g., body-parser failing) reach Nest's filters only if they surface through the Nest adapter; handle parser errors explicitly if you need a specific response.

## 2. Modules and dependency injection

```ts
@Module({
  imports: [PrismaModule, forwardRef(() => OtherModule)], // avoid forwardRef; extract a shared module instead
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService], // only what other modules need
})
export class OrdersModule {}
```

Rules of thumb:
- **Feature modules** own their controller, service, DTOs. They import infra modules (`PrismaModule`, `RedisModule`) rather than re-providing the same class.
- **Never list the same provider in two modules** (e.g., providing `OtpRateLimitService` in both `RedisModule` and `OtpModule`). Nest creates *two instances*, each with its own state. Provide once, export, import.
- **`@Global()`** is acceptable for config/DB/cache. If you need it for a business module, you're hiding a dependency.
- **Scopes:** default `Scope.DEFAULT` (singleton). `Scope.REQUEST` bubbles up to every dependent and costs per-request instantiation; prefer passing request context as method arguments or using `AsyncLocalStorage` (`nestjs-cls`) for request-scoped data like a trace ID.
- **Custom providers:** `useClass`, `useValue`, `useFactory` (+ `inject`), `useExisting`. Use injection tokens (`const REDIS = Symbol('REDIS')` + `@Inject(REDIS)`) when the thing isn't a class.
- **Dynamic modules** for configurable wiring:

```ts
@Module({})
export class FeatureModule {
  static register(opts: { enabled: boolean }): DynamicModule {
    return {
      module: FeatureModule,
      imports: opts.enabled ? [BullModule.registerQueue({ name: 'jobs' })] : [],
      providers: opts.enabled ? [JobsService] : [],
      exports: opts.enabled ? [JobsService] : [],
    };
  }
}
```
  Use `forRootAsync({ inject: [ConfigService], useFactory })` when options come from config. Reading `process.env` at import time (as a module-level constant) works but bypasses validated config and is invisible to tests; prefer `ConfigService` in a factory where possible.
- **Optional dependencies:** `@Optional()` lets a provider work when another module is absent (e.g., queue disabled). Document the fallback behavior; a silent fallback can hide misconfiguration.

## 3. Controllers and DTOs

A controller does four things: route, authenticate/authorize (via decorators), bind input to a DTO, call one service method. If a controller has `if` statements about business rules, move them down.

```ts
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(id);
  }
}
```

DTO (class, not interface, because decorators need runtime metadata):

```ts
export class CreateOrderDto {
  @IsString() @Length(1, 64)
  sku!: string;

  @IsInt() @Min(1) @Max(1000)
  quantity!: number;

  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MaxLength(200)
  note?: string;
}
```

- Separate request DTOs from response shapes. Return explicit objects (or `@Exclude()`/`@Expose()` + `ClassSerializerInterceptor`) so internal columns (hashes, secrets) never reach clients.
- `PartialType`, `PickType`, `OmitType` (from `@nestjs/swagger` or `@nestjs/mapped-types`) derive update DTOs without drift.
- Use `@Res()` only when you must (custom status/headers/stream). It disables Nest's response handling and interceptors unless you pass `{ passthrough: true }`. Prefer `@Header()`, `@HttpCode()`, `@Redirect()`.
- Consistent verbs and codes: `POST` create -> 201; `PUT/PATCH` update -> 200; `DELETE` -> 204; validation -> 400; unauthenticated -> 401; unauthorized -> 403; missing -> 404; duplicate/state conflict -> 409; semantic problem -> 422; rate limited -> 429 (+ `Retry-After`); upstream dependency failure -> 502/503.

## 4. Pipes and validation

Global setup (put it in one shared `configureApp()` so tests and `main.ts` match):

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // strip properties without decorators
  forbidNonWhitelisted: true,   // 400 on unknown properties (blocks mass assignment)
  transform: true,              // instantiate DTO classes, coerce primitives
  transformOptions: { enableImplicitConversion: false }, // explicit @Type() is safer
}));
```

- To inject dependencies into a pipe/guard/filter/interceptor registered globally, register through the DI system: `{ provide: APP_PIPE, useClass: ... }` in a module. `app.useGlobal*` instances cannot use DI.
- Built-in param pipes: `ParseIntPipe`, `ParseUUIDPipe`, `ParseEnumPipe`, `ParseBoolPipe`, `DefaultValuePipe`.
- Nested objects need `@ValidateNested()` + `@Type(() => Child)`.
- Query params arrive as strings. With `transform: true` and `@Type(() => Number)` (or `ParseIntPipe`) you get numbers. Always cap `limit` (`@Max(100)`) so clients can't request 10 million rows.
- Custom validators (`registerDecorator` / `ValidatorConstraint`) for domain formats (Stellar keys, phone numbers) so the rule lives in one place and is reusable.
- A TypeScript index signature on a DTO (`[key: string]: unknown`) is erased at runtime, so it does not disable `whitelist`, but it makes the type say "anything goes" and lets typos compile. Declare the fields instead.

## 5. Guards, custom decorators, and authorization

```ts
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : undefined;
    if (!token) throw new UnauthorizedException();
    try {
      req['user'] = await this.jwt.verifyAsync(token, { algorithms: ['HS256'], issuer: 'my-issuer' });
    } catch {
      throw new UnauthorizedException(); // same message for expired/invalid: don't help attackers
    }
    return true;
  }
}
```

- **Secure by default:** register the auth guard globally (`APP_GUARD`) and opt *out* with `@Public()`, so a forgotten decorator fails closed instead of open.
- Authentication (who) and authorization (what they may do) are different guards. RBAC: `@Roles('ADMIN')` + `RolesGuard` using `Reflector`. Resource ownership (can *this* user touch *this* order?) is a service-level check, because it needs data.
- `@CurrentUser()` param decorator via `createParamDecorator` keeps `req.user` access typed and out of controllers.
- Guards that call remote services or the DB add latency to every request; cache or keep them local (JWT verification is local).
- Signature/HMAC guards must hash the **raw bytes** received, not `JSON.stringify(body)`, and compare with `timingSafeEqual`. Add a timestamp window and a nonce/idempotency store to stop replays. Capture raw bytes with the body parser's `verify` callback or `NestFactory.create(AppModule, { rawBody: true })`.
- `@nestjs/throttler`: set a sane global default (`APP_GUARD`), override per route with `@Throttle`, use `@SkipThrottle` for health. The default store is in-memory (per process); with more than one instance use `@nest-lab/throttler-storage-redis` or your own Redis limiter, else limits multiply by instance count.

## 6. Interceptors

For cross-cutting wrap-around behavior: timing/logging, response envelope, caching, timeout, retry, serialization.

```ts
@Injectable()
export class TimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = ctx.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${req.method} ${req.originalUrl} ${Date.now() - started}ms`),
        error: (e) => this.logger.warn(`${req.method} ${req.originalUrl} failed ${Date.now() - started}ms ${e?.status ?? ''}`),
      }),
    );
  }
}
```
Use `timeout(5000)` from RxJS (`next.handle().pipe(timeout(5000))`) to bound slow handlers, and map `TimeoutError` to `RequestTimeoutException`.

## 7. Exceptions and filters

- Services throw built-in HTTP exceptions or small domain errors. Don't catch-and-swallow; either handle it meaningfully or let it propagate.
- Keep the error body consistent. A global `@Catch()` filter should:
  - map `HttpException` -> its status and a stable body,
  - map known infra errors (Prisma `P2002` -> 409, `P2025` -> 404) *in one place*,
  - map everything else to a generic 500 and log the stack with a request/trace ID,
  - never include internals (SQL, stack, upstream message) in the client body.
- When a route must return an exact legacy body, a typed exception that carries the body (as `ApiResponseException` does here) is clearer than building `res.status().json()` inside a service.
- Register the filter via `APP_FILTER` so it can inject `Logger`/config.

## 8. Configuration

```ts
ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
    PORT: Joi.number().port().default(3000),
    DATABASE_URL: Joi.string().uri().required(),            // no fake default in prod
    JWT_SECRET: Joi.string().min(32).required(),
    CORS_ORIGIN: Joi.string().required(),                   // explicit allowlist, not '*'
  }),
  validationOptions: { abortEarly: false },
})
```

- **Fail fast:** secrets that the app can't function without are `required()`. A default like `postgresql://localhost/mock` makes a mis-set production env *start successfully and fail later*.
- Read via `ConfigService.getOrThrow<T>()` (throws if missing) rather than `get()` + non-null assertion.
- Every variable read anywhere should be in the schema and in `.env.example`. A variable that's only checked at call time (`if (!secret) throw`) is validated too late.
- Group related settings with `registerAs('db', () => ({...}))` namespaced config when it grows.
- Booleans from env are strings; use `Joi.boolean()` (converts) and compare against the converted value.

## 9. Persistence with Prisma

Wrap Prisma in an injectable `PrismaService extends PrismaClient`, connect in `onModuleInit` (or rely on lazy connect), disconnect in `onModuleDestroy` (needs `enableShutdownHooks()`).

```ts
// atomic multi-write
await this.prisma.$transaction(async (tx) => {
  const acct = await tx.account.update({ where: { id }, data: { balance: { decrement: amt } } });
  if (acct.balance < 0n) throw new ConflictException('Insufficient funds'); // rolls back
  await tx.ledger.create({ data: { accountId: id, delta: -amt } });
});

// race-proof uniqueness
try {
  return await this.prisma.user.create({ data });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException();
  throw e;
}
```

- No network calls (RPC, HTTP, SMS) inside a transaction; they hold a connection and a lock. Persist intent first, call out, then record the outcome.
- State machines (`PENDING -> SETTLED/FAILED`) change with conditional updates (`updateMany({ where: { id, status: 'PENDING' }, data })` and check `count`) so two workers can't both "win".
- Use `select`/`include` deliberately. Add `@@index` for each frequent filter+sort. Check `EXPLAIN` for list endpoints.
- Migrations: `prisma migrate dev` locally, `prisma migrate deploy` in CD as a *separate step* before the new version starts. Make migrations backward compatible with the previous app version (add nullable column -> deploy code -> backfill -> add constraint).
- Pooling: serverless/pgBouncer needs the pooled URL for runtime and a direct URL for migrations. Size the pool to (instances x pool size) <= DB max connections.
- `BigInt` isn't JSON-serializable; convert to string at the boundary (`toString()`), never `Number()` for token amounts.
- Never store plaintext PINs/passwords/secret keys. Hash with argon2/bcrypt; encrypt secrets at rest with an app key (AES-GCM) and keep the key outside the DB.

## 10. Queues and background jobs (BullMQ)

```ts
// producer
await this.queue.add('settle', data, {
  jobId: `settle-${sha256(nonce)}`,                 // dedupes: same voucher can't be queued twice
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 500 },
  removeOnFail: false,                              // keep for inspection / manual replay
});

// consumer
@Processor('settlements')
export class SettlementProcessor extends WorkerHost {
  async process(job: Job) {
    if (!valid(job.data)) throw new UnrecoverableError('bad payload'); // don't retry what can't succeed
    return this.service.handle(job.data);                              // thin: logic lives in the service
  }
}
```

- Handlers must be **idempotent**: a job can run more than once (retry, worker crash after side effect, duplicate enqueue). Use unique constraints / status checks so repeat runs are no-ops.
- Classify errors: transient (timeouts, 5xx, lock contention) -> throw to retry; permanent (validation, signature invalid, business rejection) -> `UnrecoverableError`.
- Redis connection for BullMQ needs `maxRetriesPerRequest: null`.
- Only register workers in the process that should run them (flag-gated or a separate worker deployment) so scaling the API doesn't scale consumers unintentionally.
- Distributed lock (`SET key token NX PX ttl` + compare-and-delete Lua release) serializes a shared resource like a single signing account's sequence number. Keep the critical section short, always release in `finally`, and make TTL > worst-case hold time.

## 11. Lifecycle, shutdown, and health

Hook order: `onModuleInit` -> `onApplicationBootstrap` -> (serving) -> `onModuleDestroy` -> `beforeApplicationShutdown` -> `onApplicationShutdown`.

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();          // SIGTERM/SIGINT trigger the destroy hooks; without this they never run
```
Closing: stop accepting traffic, let in-flight requests finish, close queue workers, then Redis and the DB. Set the platform's termination grace period (e.g., Kubernetes `terminationGracePeriodSeconds`) longer than your longest request.

Health (`@nestjs/terminus`):
- **Liveness** `/health/live`: returns 200 if the event loop is alive. No dependency checks (a DB blip must not restart every pod).
- **Readiness** `/health/ready`: DB, Redis, critical upstreams, each with a short timeout. Return 503 when not ready so the load balancer stops routing.
- Don't expose secrets or config in health output; "deep" probes that call paid/rate-limited upstreams should be protected or off by default.

## 12. Logging and observability

- Use Nest's `Logger` (or `nestjs-pino`) with a class-name context. In production emit JSON logs with a **request/trace ID** on every line (generate in middleware, propagate via `AsyncLocalStorage`, return it in an `X-Request-Id` header).
- Log levels: `error` = needs a human, `warn` = degraded but handled, `log` = business events, `debug` = diagnostics (off in prod).
- Redact: tokens, passwords, PINs, OTPs, secret keys, full phone numbers/emails (mask them).
- Metrics worth having: request rate/latency/error rate per route, queue depth and failed jobs, DB pool usage, upstream latency, business counters (settlements by status). Expose with Prometheus/OpenTelemetry.

## 13. Swagger / OpenAPI

- Add the Nest CLI plugin so DTO classes are documented automatically, instead of hand-writing `@ApiProperty` on every field:
  `nest-cli.json` -> `"compilerOptions": { "plugins": ["@nestjs/swagger"] }` (DTO files must end in `.dto.ts` or `.entity.ts`).
- Use `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`, `@ApiResponse` on controllers so the document is a real contract that mobile/frontend can generate clients from.
- Without the plugin or decorators, Swagger lists routes but shows empty schemas, which is documentation in name only.

## 14. Testing

Unit (service) with mocks:

```ts
const module = await Test.createTestingModule({
  providers: [OrdersService, { provide: PrismaService, useValue: { order: { create: jest.fn() } } }],
}).compile();
const service = module.get(OrdersService);
```

e2e (whole pipeline) with the **same app configuration as production**:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PrismaService).useValue(fakePrisma)
  .overrideProvider(RedisService).useValue(fakeRedis)
  .compile();
const app = moduleRef.createNestApplication();
configureApp(app);            // the shared function main.ts uses: prefix, pipes, filters, CORS
await app.init();
await request(app.getHttpServer()).post('/api/orders').send({}).expect(400);
```

- Unit tests do **not** run guards, pipes, interceptors or filters. If the behavior depends on them (validation errors, 401 vs 403, error body shape, raw body), test it e2e.
- Assert on contracts (status, body shape, headers), not implementation details.
- Fake time (`jest.useFakeTimers`) for TTLs/backoff; never `sleep` in tests.
- Keep one test location convention per repo. Duplicate copies of the same spec in two folders drift and hide failures.
- Property-based tests (`fast-check`) fit parsers, encoders and money math.
- Coverage is a smoke alarm, not a goal; critical paths (auth, money, idempotency, parsing of untrusted input) deserve branch coverage, getters don't.

## 15. Express 5 / Nest 11 gotchas

- Express 5 uses `path-to-regexp` v8: bare `*` wildcards are no longer valid in route strings or `forRoutes`; use named wildcards (`/files/*splat`) and `{/:optional}` syntax. Old patterns like `'/.well-known/(.*)'` may need migrating (the repo's `setGlobalPrefix` exclude uses one; confirm it behaves on the installed version).
- Express 5's default query parser is `simple`, so `?a[b]=1` no longer becomes a nested object unless you set `app.set('query parser', 'extended')`.
- `req.body` is `undefined` (not `{}`) when no body parser matched.
- `@nestjs/jwt` v12 / ESM-only dependencies can require Jest `transformIgnorePatterns` changes (this repo already has one).
- With `module: nodenext`, relative imports need explicit `.js` extensions; be consistent.
- Behind a proxy/load balancer set `app.set('trust proxy', <hops|true|subnet>)` before relying on `req.ip`.

## 16. Anti-patterns

| Smell | Why it hurts | Instead |
|---|---|---|
| Fat controller with business logic | Untestable without HTTP, logic duplicated | Thin controller, logic in service |
| `process.env.X` inside services | Unvalidated, untestable, scattered | `ConfigService` + Joi schema |
| Validation duplicated in DTO *and* service | Two sources of truth that drift | DTO for shape, service for business rules |
| Check-then-insert | Race condition under concurrency | Unique index + catch `P2002` |
| Returning raw DB rows | Leaks `pin`, internal ids | Explicit response mapping / `select` |
| `catch (e) {}` or `catch { return null }` | Hides failures | Handle specifically or rethrow |
| Same provider declared in two modules | Two instances, split state | Provide once, export, import |
| `@Global()` everywhere | Hidden dependency graph | Explicit imports; global only for infra |
| Trusting `X-Forwarded-For` from the client | Spoofable rate-limit key / audit IP | `trust proxy` + `req.ip` |
| `CORS_ORIGIN='*'` default in production | Any site can call your API from a browser | Explicit allowlist, required in prod |
| Fake defaults for secrets/URLs | App boots in a broken state | `required()` in production |
| Business logic in `*.util.ts` classes | Naming lies; hard to find | `*.service.ts` for services |
| `any` on request bodies/upstream data | Bugs and injections enter silently | DTO or `unknown` + narrowing |
| Network calls inside DB transactions | Long locks, pool exhaustion | Persist intent -> call -> record outcome |
| Floats for money | Rounding errors | `BigInt`/integer minor units, strings in JSON |
| No shutdown hooks | Dropped requests/jobs on deploy | `enableShutdownHooks()` |
| Committed logs, scratch scripts, `.tmp.mjs` | Noise, accidental secret exposure | `.gitignore`; keep tooling under `scripts/` |
| Unbounded list endpoints | Memory/latency blowups, scraping | Pagination with a max page size |
