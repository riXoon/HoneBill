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
exports.OtpRateLimitService = exports.RateLimitedException = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const redis_service_js_1 = require("../../infra/redis/redis.service.js");
class RateLimitedException extends common_1.HttpException {
    retryAfterSeconds;
    constructor(message, retryAfterSeconds) {
        super({ error: message }, 429);
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.RateLimitedException = RateLimitedException;
const SLIDING = `
local now, window, limit = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return tonumber(oldest[2]) + window - now
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 0
`;
let OtpRateLimitService = class OtpRateLimitService {
    redis;
    config;
    constructor(redis, config) {
        this.redis = redis;
        this.config = config;
    }
    async hit(key, limit, windowMs) {
        const now = Date.now();
        const wait = await this.redis.getClient().eval(SLIDING, 1, key, now, windowMs, limit, `${now}-${(0, node_crypto_1.randomUUID)()}`);
        return Number(wait);
    }
    async enforce(key, limit, windowMs) {
        const wait = await this.hit(key, limit, windowMs);
        if (wait > 0) {
            throw new RateLimitedException('Too many requests. Please try again later.', Math.ceil(wait / 1000));
        }
    }
    async enforceSendLimits(ip, phone) {
        const globalLimit = Number(this.config.get('OTP_GLOBAL_LIMIT_PER_HOUR') ?? 300);
        const checks = [
            [`pijin:api:otp:ratelimit:${ip}_${phone}`, 3, 5 * 60_000],
            [`pijin:api:otp:phone:${phone}`, 5, 60 * 60_000],
            [`pijin:api:otp:global:all`, globalLimit, 60 * 60_000],
        ];
        for (const [key, limit, windowMs] of checks) {
            const wait = await this.hit(key, limit, windowMs);
            if (wait > 0) {
                throw new RateLimitedException('Too many OTP requests. Please wait a few minutes.', Math.ceil(wait / 1000));
            }
        }
    }
};
exports.OtpRateLimitService = OtpRateLimitService;
exports.OtpRateLimitService = OtpRateLimitService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_js_1.RedisService, config_1.ConfigService])
], OtpRateLimitService);
//# sourceMappingURL=otp-rate-limit.service.js.map