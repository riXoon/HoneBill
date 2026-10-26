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
var AccountsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_js_1 = require("../../infra/prisma/prisma.service.js");
const redis_service_js_1 = require("../../infra/redis/redis.service.js");
const phone_util_js_1 = require("../auth/phone.util.js");
const pin_util_js_1 = require("../auth/pin.util.js");
const short_id_util_js_1 = require("../auth/short-id.util.js");
const otp_util_js_1 = require("../auth/otp.util.js");
const STELLAR_KEY_PATTERN = /^G[A-Z2-7]{55}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 50;
const MAX_EMAIL_LENGTH = 254;
const MAX_SHORT_ID_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const INCREMENT_PIN_FAILURES_SCRIPT = `
local failures = redis.call('INCR', KEYS[1])
if failures == 1 or failures >= tonumber(ARGV[1]) then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return failures
`;
let AccountsService = AccountsService_1 = class AccountsService {
    prisma;
    redisService;
    configService;
    constructor(prisma, redisService, configService) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.configService = configService;
    }
    static assertUniqueViolation(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }
        const candidate = error;
        return candidate.code === 'P2002';
    }
    async register(payload) {
        const stellarPublicKey = typeof payload.stellarPublicKey === 'string' ? payload.stellarPublicKey.trim() : '';
        if (!stellarPublicKey) {
            throw new common_1.BadRequestException('Missing required field: stellarPublicKey');
        }
        if (!STELLAR_KEY_PATTERN.test(stellarPublicKey)) {
            throw new common_1.BadRequestException('Invalid Stellar Public Key format');
        }
        const offlineDeviceKey = typeof payload.offlineDeviceKey === 'string' ? payload.offlineDeviceKey.trim() : '';
        if (offlineDeviceKey && !STELLAR_KEY_PATTERN.test(offlineDeviceKey)) {
            throw new common_1.BadRequestException('Invalid offline device public key format');
        }
        const rawPhone = typeof payload.phoneNumber === 'string' ? payload.phoneNumber.trim() : '';
        if (rawPhone && !(0, phone_util_js_1.isPlausiblePhone)(rawPhone)) {
            throw new common_1.BadRequestException('Invalid phone number.');
        }
        const cleanPhone = rawPhone ? (0, phone_util_js_1.toDbPhone)(rawPhone) : null;
        const rawPin = typeof payload.pin === 'string' ? payload.pin.trim() : '';
        if (rawPin && !(0, pin_util_js_1.isValidPinFormat)(rawPin)) {
            throw new common_1.BadRequestException('PIN must be 4 to 6 digits.');
        }
        const firstName = typeof payload.firstName === 'string' ? payload.firstName.trim() : null;
        const lastName = typeof payload.lastName === 'string' ? payload.lastName.trim() : null;
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
        if (firstName && firstName.length > MAX_NAME_LENGTH) {
            throw new common_1.BadRequestException(`First name must be at most ${MAX_NAME_LENGTH} characters.`);
        }
        if (lastName && lastName.length > MAX_NAME_LENGTH) {
            throw new common_1.BadRequestException(`Last name must be at most ${MAX_NAME_LENGTH} characters.`);
        }
        if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
            throw new common_1.BadRequestException('Invalid email address.');
        }
        const verificationToken = typeof payload.verificationToken === 'string' ? payload.verificationToken.trim() : '';
        if (verificationToken || this.isOtpTokenRequired()) {
            const otpSecret = this.configService.get('OTP_VERIFICATION_JWT_SECRET');
            if (!cleanPhone ||
                !verificationToken ||
                !(0, otp_util_js_1.verifyVerificationToken)(verificationToken, cleanPhone, otpSecret)) {
                throw new common_1.UnauthorizedException('Phone verification required. Please verify your number again.');
            }
        }
        const [existingKey, existingPhone] = await Promise.all([
            this.prisma.account.findUnique({ where: { stellarPublicKey }, select: { id: true } }),
            cleanPhone ? this.prisma.account.findFirst({ where: { phoneNumber: cleanPhone }, select: { id: true } }) : null,
        ]);
        if (existingKey) {
            throw new common_1.ConflictException('Stellar Public Key is already registered.');
        }
        if (existingPhone) {
            throw new common_1.ConflictException('Phone number is already registered.');
        }
        const pinHash = rawPin ? await (0, pin_util_js_1.hashPin)(rawPin) : null;
        for (let attempt = 0; attempt < MAX_SHORT_ID_ATTEMPTS; attempt += 1) {
            try {
                const created = await this.prisma.account.create({
                    data: {
                        shortId: (0, short_id_util_js_1.generateBase62Id)(),
                        role: 'USER',
                        stellarPublicKey,
                        offlineDeviceKey: offlineDeviceKey || null,
                        pin: pinHash,
                        phoneNumber: cleanPhone,
                        firstName,
                        lastName,
                        email,
                    },
                });
                const { pin: _pin, ...result } = created;
                return { success: true, data: result };
            }
            catch (error) {
                if (!AccountsService_1.assertUniqueViolation(error)) {
                    throw error;
                }
                const target = error.meta?.target;
                const targetFields = typeof target === 'string' ? [target] : Array.isArray(target) ? target : [];
                if (targetFields.some((field) => String(field).includes('short'))) {
                    continue;
                }
                if (targetFields.some((field) => String(field).includes('phone'))) {
                    throw new common_1.ConflictException('Phone number is already registered.');
                }
                if (targetFields.some((field) => String(field).includes('stellar'))) {
                    throw new common_1.ConflictException('Stellar Public Key is already registered.');
                }
                throw error;
            }
        }
        throw new common_1.BadRequestException('Failed to generate a unique short ID. Please try again.');
    }
    async checkUser(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone) {
            throw new common_1.BadRequestException('Missing required parameter: phone');
        }
        const account = await this.prisma.account.findFirst({
            where: { phoneNumber: cleanPhone },
            select: { stellarPublicKey: true, shortId: true },
        });
        if (!account) {
            return { exists: false };
        }
        return {
            exists: true,
            stellarPublicKey: account.stellarPublicKey,
            shortId: account.shortId,
        };
    }
    async lookupUser(shortId, phone) {
        if (!shortId && !phone) {
            throw new common_1.BadRequestException('Provide at least one query parameter: shortId or phone');
        }
        let account = null;
        if (shortId) {
            account = await this.prisma.account.findUnique({
                where: { shortId },
                select: {
                    shortId: true,
                    stellarPublicKey: true,
                    offlineDeviceKey: true,
                    firstName: true,
                    lastName: true,
                },
            });
        }
        else if (phone) {
            account = await this.prisma.account.findFirst({
                where: { phoneNumber: phone.replace(/\D/g, '') },
                select: {
                    shortId: true,
                    stellarPublicKey: true,
                    offlineDeviceKey: true,
                    firstName: true,
                    lastName: true,
                },
            });
        }
        if (!account) {
            throw new common_1.NotFoundException({ found: false });
        }
        const firstName = account.firstName ?? '';
        const lastName = account.lastName ?? '';
        const displayName = [firstName, lastName].filter(Boolean).join(' ') || account.shortId;
        return {
            found: true,
            shortId: account.shortId,
            stellarPublicKey: account.stellarPublicKey,
            offlineDeviceKey: account.offlineDeviceKey ?? null,
            displayName,
            firstName,
            lastName,
        };
    }
    async verifyPin(phoneNumber, pin) {
        if (!phoneNumber || !(0, phone_util_js_1.isPlausiblePhone)(phoneNumber) || !(0, pin_util_js_1.isValidPinFormat)(pin)) {
            throw new common_1.BadRequestException('A valid phone number and PIN are required.');
        }
        const dbPhone = (0, phone_util_js_1.toDbPhone)(phoneNumber);
        const failKey = `pijin:pin:fail:${dbPhone}`;
        const redis = this.redisService.getClient();
        let currentFailures;
        let retryAfter;
        try {
            currentFailures = Number((await redis.get(failKey)) ?? 0);
            retryAfter = await redis.ttl(failKey);
        }
        catch {
            throw new common_1.ServiceUnavailableException('PIN verification is temporarily unavailable.');
        }
        if (currentFailures >= MAX_FAILURES) {
            throw new common_1.HttpException({
                error: 'Too many incorrect PIN attempts. Please try again later.',
                retryAfter: retryAfter > 0 ? retryAfter : PIN_LOCKOUT_SECONDS,
            }, 423);
        }
        const account = await this.prisma.account.findFirst({
            where: { phoneNumber: dbPhone },
            orderBy: { createdAt: 'desc' },
            select: { id: true, pin: true },
        });
        if (!account || !account.pin) {
            throw new common_1.NotFoundException('Account not found.');
        }
        const { ok, needsRehash } = await (0, pin_util_js_1.verifyPin)(pin, account.pin);
        if (!ok) {
            let nextCount;
            try {
                nextCount = Number(await redis.eval(INCREMENT_PIN_FAILURES_SCRIPT, 1, failKey, String(MAX_FAILURES), String(PIN_LOCKOUT_SECONDS)));
            }
            catch {
                throw new common_1.ServiceUnavailableException('PIN verification is temporarily unavailable.');
            }
            if (nextCount >= MAX_FAILURES) {
                throw new common_1.HttpException({
                    error: 'Too many incorrect PIN attempts. Please try again later.',
                    retryAfter: PIN_LOCKOUT_SECONDS,
                }, 423);
            }
            throw new common_1.UnauthorizedException({
                error: 'Incorrect PIN.',
                attemptsRemaining: MAX_FAILURES - nextCount,
            });
        }
        try {
            await redis.del(failKey);
        }
        catch {
            throw new common_1.ServiceUnavailableException('PIN verification is temporarily unavailable.');
        }
        if (needsRehash) {
            await this.prisma.account.update({ where: { id: account.id }, data: { pin: await (0, pin_util_js_1.hashPin)(pin) } });
        }
        return { success: true };
    }
    isOtpTokenRequired() {
        const required = this.configService.get('REQUIRE_OTP_TOKEN');
        return required === true || required === 'true';
    }
};
exports.AccountsService = AccountsService;
exports.AccountsService = AccountsService = AccountsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService,
        redis_service_js_1.RedisService,
        config_1.ConfigService])
], AccountsService);
//# sourceMappingURL=accounts.service.js.map