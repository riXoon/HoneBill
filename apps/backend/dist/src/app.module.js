"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const env_validation_1 = require("./config/env.validation");
const legacy_http_exception_filter_1 = require("./common/filters/legacy-http-exception.filter");
const health_module_1 = require("./modules/health/health.module");
const prisma_module_1 = require("./infra/prisma/prisma.module");
const redis_module_1 = require("./infra/redis/redis.module");
const queue_module_1 = require("./infra/queue/queue.module");
const lock_module_1 = require("./infra/lock/lock.module");
const stellar_module_1 = require("./infra/stellar/stellar.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validationSchema: env_validation_1.envValidationSchema,
                validationOptions: {
                    abortEarly: false,
                },
            }),
            throttler_1.ThrottlerModule.forRoot({
                throttlers: [
                    {
                        ttl: 60_000,
                        limit: 120,
                    },
                ],
            }),
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            ...(process.env.QUEUE_ENABLED === 'true' ? [queue_module_1.QueueModule] : []),
            lock_module_1.LockModule,
            stellar_module_1.StellarModule,
            health_module_1.HealthModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
            {
                provide: core_1.APP_FILTER,
                useClass: legacy_http_exception_filter_1.LegacyHttpExceptionFilter,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map