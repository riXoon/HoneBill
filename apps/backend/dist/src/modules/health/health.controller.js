"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const database_health_1 = require("./indicators/database.health");
const redis_health_1 = require("./indicators/redis.health");
const stellar_rpc_health_1 = require("./indicators/stellar-rpc.health");
let HealthController = class HealthController {
    health;
    database;
    redis;
    stellarRpc;
    constructor(health, database, redis, stellarRpc) {
        this.health = health;
        this.database = database;
        this.redis = redis;
        this.stellarRpc = stellarRpc;
    }
    check() {
        return this.health.check([
            async () => this.database.pingCheck('database'),
            async () => this.redis.pingCheck('redis'),
            async () => this.stellarRpc.pingCheck('sorobanRpc'),
        ]);
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, terminus_1.HealthCheck)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('health'),
    __metadata("design:paramtypes", [terminus_1.HealthCheckService,
        database_health_1.DatabaseHealthIndicator,
        redis_health_1.RedisHealthIndicator,
        stellar_rpc_health_1.StellarRpcHealthIndicator])
], HealthController);
//# sourceMappingURL=health.controller.js.map