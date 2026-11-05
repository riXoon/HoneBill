---
name: nestjs
description: "Build, change, or debug the NestJS backend in this repository. Use for its controllers, modules, services, middleware, guards, request validation, and tests; not for mobile or Soroban contract work."
---

# NestJS backend (HoneBill)

Use this skill for `apps/backend`, the NestJS API in this repository. Inspect the existing feature module and neighboring specs before changing structure or behavior.

## Route and module structure

- `src/main.ts` creates the Express-backed Nest app and applies middleware in order. `src/bootstrap.ts` configures the global `/api` prefix, CORS, the strict global `ValidationPipe`, Swagger, and exception handling.
- Feature code belongs under `src/modules/<feature>/`. Controllers define HTTP routes and translate request data into service calls. Services own business logic and persistence. Modules register controllers/providers and import the dependencies they use.
- Do not call one controller from another. Share behavior through an injected service. Add each feature module to `src/app.module.ts` when it must be part of the app.
- A route path is the global prefix plus controller and method decorators. For example, `@Controller('v2')` with `@Post('registeruser')` maps to `POST /api/v2/registeruser`. Keep route versioning and compatibility decisions explicit; do not silently move existing paths.
- Follow the repository's TypeScript import convention, including `.js` suffixes on relative imports where neighboring files use them.

## Preserve HTTP behavior

- Use DTOs and the configured validation pipe for request validation. It transforms values, removes no unknown fields silently, and rejects non-whitelisted fields.
- Preserve established status codes, response shapes, and unsupported-method behavior. Some controllers use `@All()` handlers to return `405`; check the route's existing tests and legacy parity expectations before changing them.
- `src/main.ts` installs the bounded SMS webhook parser before general request parsing. Preserve this order and route-specific raw-body handling when editing middleware or webhook controllers.
- Use existing guards and exception filters for authentication and error translation. Keep transport concerns in controllers and domain behavior in services.

## Infrastructure conventions

- The backend uses Prisma with `@prisma/adapter-pg` through `src/infra/prisma/prisma.service.ts`. Runtime database access reads `DATABASE_URL`; Prisma CLI configuration is in `prisma.config.ts` and prefers `DATABASE_URL_UNPOOLED` when available for migrations.
- Redis access goes through the shared `RedisService`. Queue modules are conditionally registered when `QUEUE_ENABLED` is `true`; do not assume a queue is available in every environment.
- Never print or commit `.env` values. When inspecting configuration, report variable names or whether they are set, not their values.

## Build and verification

Run commands from `apps/backend`:

- `npm run build` builds the backend and generates the Prisma client.
- `npm run typecheck` runs the TypeScript check.
- `npm run test:phase3` runs the focused wallet and settlement unit suite.
- `npm run test:e2e -- --runInBand` runs the backend E2E suite; some E2E specs require Redis at `127.0.0.1:6379`.

When a user asks for verification, choose the narrowest relevant tests and report external dependencies or live services that were unavailable. Do not submit real SMS, payments, or Stellar transactions as a side effect of route testing; use mocks or validation-only requests unless the user explicitly requests a live operation.