"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIN_PATTERN = void 0;
exports.isValidPinFormat = isValidPinFormat;
exports.isHashedPin = isHashedPin;
exports.hashPin = hashPin;
exports.constantTimeEqual = constantTimeEqual;
exports.verifyPin = verifyPin;
const node_crypto_1 = __importDefault(require("node:crypto"));
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const PREFIX = 'scrypt$';
exports.PIN_PATTERN = /^\d{4,6}$/;
function isValidPinFormat(pin) {
    return typeof pin === 'string' && exports.PIN_PATTERN.test(pin);
}
function isHashedPin(stored) {
    return stored.startsWith(PREFIX);
}
function scrypt(pin, salt, n, r, p) {
    return new Promise((resolve, reject) => {
        node_crypto_1.default.scrypt(pin, salt, KEY_LEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(key);
            }
        });
    });
}
async function hashPin(pin) {
    const salt = node_crypto_1.default.randomBytes(SALT_LEN);
    const key = await scrypt(pin, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
    return `${PREFIX}${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function constantTimeEqual(a, b) {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
        node_crypto_1.default.timingSafeEqual(bufA, bufA);
        return false;
    }
    return node_crypto_1.default.timingSafeEqual(bufA, bufB);
}
async function verifyPin(pin, stored) {
    if (!isHashedPin(stored)) {
        return { ok: constantTimeEqual(pin, stored), needsRehash: true };
    }
    const parts = stored.split('$');
    if (parts.length !== 6) {
        return { ok: false, needsRehash: false };
    }
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(pin, Buffer.from(saltB64, 'base64'), Number(nStr), Number(rStr), Number(pStr));
    const ok = expected.length === actual.length && node_crypto_1.default.timingSafeEqual(expected, actual);
    return { ok, needsRehash: ok && Number(nStr) !== SCRYPT_N };
}
//# sourceMappingURL=pin.util.js.map