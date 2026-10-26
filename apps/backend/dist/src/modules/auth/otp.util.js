"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFICATION_TOKEN_TTL_SECONDS = exports.OTP_MAX_ATTEMPTS = exports.OTP_TTL_SECONDS = exports.toDbPhone = void 0;
exports.generateOtp = generateOtp;
exports.otpMatches = otpMatches;
exports.getTestOtpCode = getTestOtpCode;
exports.signVerificationToken = signVerificationToken;
exports.verifyVerificationToken = verifyVerificationToken;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pin_util_js_1 = require("./pin.util.js");
const phone_util_js_1 = require("./phone.util.js");
var phone_util_js_2 = require("./phone.util.js");
Object.defineProperty(exports, "toDbPhone", { enumerable: true, get: function () { return phone_util_js_2.toDbPhone; } });
exports.OTP_TTL_SECONDS = 300;
exports.OTP_MAX_ATTEMPTS = 5;
exports.VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;
const TOKEN_ISSUER = 'pijin-otp';
const TOKEN_PURPOSE = 'phone-verification';
function generateOtp() {
    return node_crypto_1.default.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
function otpMatches(stored, provided) {
    const expected = String(stored).trim();
    const expectedNormalized = expected.length < 6 ? expected.padStart(6, '0') : expected;
    const candidate = String(provided).trim();
    return (0, pin_util_js_1.constantTimeEqual)(expectedNormalized, candidate);
}
function getTestOtpCode(phone, env = process.env) {
    if (env.OTP_TEST_MODE !== 'true')
        return null;
    const code = env.OTP_TEST_CODE?.trim() ?? '';
    if (!/^\d{6}$/.test(code))
        return null;
    const allowList = (env.OTP_TEST_NUMBERS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => (0, phone_util_js_1.toDbPhone)(value));
    return allowList.includes((0, phone_util_js_1.toDbPhone)(phone)) ? code : null;
}
function signVerificationToken(phone, secret = process.env.OTP_VERIFICATION_JWT_SECRET) {
    if (!secret)
        return null;
    return jsonwebtoken_1.default.sign({ purpose: TOKEN_PURPOSE }, secret, {
        algorithm: 'HS256',
        subject: (0, phone_util_js_1.toDbPhone)(phone),
        issuer: TOKEN_ISSUER,
        expiresIn: exports.VERIFICATION_TOKEN_TTL_SECONDS,
    });
}
function verifyVerificationToken(token, phone, secret = process.env.OTP_VERIFICATION_JWT_SECRET) {
    if (!secret)
        return false;
    try {
        const payload = jsonwebtoken_1.default.verify(token, secret, {
            algorithms: ['HS256'],
            issuer: TOKEN_ISSUER,
        });
        return payload.purpose === TOKEN_PURPOSE && payload.sub === (0, phone_util_js_1.toDbPhone)(phone);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=otp.util.js.map