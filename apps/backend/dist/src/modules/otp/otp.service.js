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
exports.OtpService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const phone_util_js_1 = require("../auth/phone.util.js");
const otp_util_js_1 = require("../auth/otp.util.js");
const redis_service_js_1 = require("../../infra/redis/redis.service.js");
const otp_rate_limit_service_js_1 = require("../../infra/redis/otp-rate-limit.service.js");
const textbee_service_js_1 = require("./textbee.service.js");
const INCREMENT_OTP_ATTEMPTS_SCRIPT = `
local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[1]))
end
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1], KEYS[2])
end
return attempts
`;
let OtpService = class OtpService {
    textbee;
    redisService;
    configService;
    rateLimiter;
    constructor(textbee, redisService, configService, rateLimiter) {
        this.textbee = textbee;
        this.redisService = redisService;
        this.configService = configService;
        this.rateLimiter = rateLimiter;
    }
    async send(phoneNumber, clientIp) {
        if (!phoneNumber) {
            throw new common_1.BadRequestException('Phone number is required.');
        }
        if (!(0, phone_util_js_1.isPlausiblePhone)(phoneNumber)) {
            throw new common_1.BadRequestException('Invalid phone number format.');
        }
        const formattedPhone = (0, phone_util_js_1.normalizePhoneNumber)(phoneNumber);
        await this.rateLimiter.enforceSendLimits(clientIp, formattedPhone);
        const testCode = (0, otp_util_js_1.getTestOtpCode)(formattedPhone, this.getOtpEnvironment());
        const code = testCode ?? (0, otp_util_js_1.generateOtp)();
        const otpKey = `pijin:otp:${formattedPhone}`;
        const attemptsKey = `pijin:otp:attempts:${formattedPhone}`;
        const redis = this.redisService.getClient();
        try {
            await redis.set(otpKey, code, 'EX', otp_util_js_1.OTP_TTL_SECONDS);
            await redis.del(attemptsKey);
        }
        catch {
            throw new common_1.ServiceUnavailableException('OTP service is temporarily unavailable.');
        }
        if (!testCode) {
            try {
                const message = `Pijin: Your verification code is ${code}. Valid for 5 minutes. Do not share this with anyone.`;
                await this.textbee.send(formattedPhone, message, {
                    retries: 1,
                    timeoutMs: 4000,
                    deadlineMs: 8000,
                });
            }
            catch (error) {
                try {
                    await redis.del(otpKey, attemptsKey);
                }
                catch {
                    throw new common_1.ServiceUnavailableException('OTP service is temporarily unavailable.');
                }
                throw new common_1.HttpException({ error: "We couldn't send the SMS. Please try again.", code: 'SMS_FAILED' }, 502, { cause: error });
            }
        }
        return {
            success: true,
            message: 'OTP sent successfully.',
        };
    }
    async verify(phoneNumber, code) {
        if (!phoneNumber || !code) {
            throw new common_1.BadRequestException('Phone number and code are required.');
        }
        const formattedPhone = (0, phone_util_js_1.normalizePhoneNumber)(phoneNumber);
        const otpKey = `pijin:otp:${formattedPhone}`;
        const attemptsKey = `pijin:otp:attempts:${formattedPhone}`;
        const redis = this.redisService.getClient();
        let storedCode;
        try {
            storedCode = await redis.get(otpKey);
        }
        catch {
            throw new common_1.ServiceUnavailableException('OTP service is temporarily unavailable.');
        }
        if (storedCode === null) {
            throw new common_1.BadRequestException('OTP has expired or was never sent. Please request a new one.');
        }
        if (!(0, otp_util_js_1.otpMatches)(storedCode, code)) {
            let attempts;
            try {
                attempts = Number(await redis.eval(INCREMENT_OTP_ATTEMPTS_SCRIPT, 2, otpKey, attemptsKey, String(otp_util_js_1.OTP_TTL_SECONDS), String(otp_util_js_1.OTP_MAX_ATTEMPTS)));
            }
            catch {
                throw new common_1.ServiceUnavailableException('OTP service is temporarily unavailable.');
            }
            if (attempts >= otp_util_js_1.OTP_MAX_ATTEMPTS) {
                throw new common_1.HttpException({ error: 'Too many incorrect attempts. Please request a new code.' }, 429);
            }
            throw new common_1.UnauthorizedException({ error: 'Invalid verification code.', attemptsRemaining: otp_util_js_1.OTP_MAX_ATTEMPTS - attempts });
        }
        try {
            await redis.del(otpKey, attemptsKey);
        }
        catch {
            throw new common_1.ServiceUnavailableException('OTP service is temporarily unavailable.');
        }
        const otpSecret = this.configService.get('OTP_VERIFICATION_JWT_SECRET');
        const verificationToken = (0, otp_util_js_1.signVerificationToken)(formattedPhone, otpSecret);
        if (!verificationToken && this.isOtpTokenRequired()) {
            throw new common_1.InternalServerErrorException('Internal Server Error');
        }
        return {
            success: true,
            message: 'Phone number verified.',
            ...(verificationToken ? { verificationToken, expiresIn: otp_util_js_1.VERIFICATION_TOKEN_TTL_SECONDS } : {}),
        };
    }
    getOtpEnvironment() {
        const testMode = this.configService.get('OTP_TEST_MODE');
        return {
            OTP_TEST_MODE: String(testMode ?? ''),
            OTP_TEST_CODE: this.configService.get('OTP_TEST_CODE'),
            OTP_TEST_NUMBERS: this.configService.get('OTP_TEST_NUMBERS'),
        };
    }
    isOtpTokenRequired() {
        const required = this.configService.get('REQUIRE_OTP_TOKEN');
        return required === true || required === 'true';
    }
};
exports.OtpService = OtpService;
exports.OtpService = OtpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [textbee_service_js_1.TextbeeService,
        redis_service_js_1.RedisService,
        config_1.ConfigService,
        otp_rate_limit_service_js_1.OtpRateLimitService])
], OtpService);
//# sourceMappingURL=otp.service.js.map