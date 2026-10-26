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
exports.PinVerifyRateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const otp_rate_limit_service_js_1 = require("../../infra/redis/otp-rate-limit.service.js");
let PinVerifyRateLimitGuard = class PinVerifyRateLimitGuard {
    limiter;
    constructor(limiter) {
        this.limiter = limiter;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        await this.limiter.enforce(`pijin:api:pin:verify:${req.ip ?? 'unknown'}`, 30, 60_000);
        return true;
    }
};
exports.PinVerifyRateLimitGuard = PinVerifyRateLimitGuard;
exports.PinVerifyRateLimitGuard = PinVerifyRateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [otp_rate_limit_service_js_1.OtpRateLimitService])
], PinVerifyRateLimitGuard);
//# sourceMappingURL=pin-verify-rate-limit.guard.js.map