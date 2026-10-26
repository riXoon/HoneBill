"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SEP10_JWT_TTL_SECONDS = void 0;
exports.parseTtl = parseTtl;
exports.DEFAULT_SEP10_JWT_TTL_SECONDS = 86400;
function parseTtl(raw, variableName = 'SEP10_JWT_TIMEOUT', defaultSeconds = exports.DEFAULT_SEP10_JWT_TTL_SECONDS) {
    if (raw === undefined || raw === null)
        return defaultSeconds;
    if (typeof raw === 'string' && raw.trim() === '')
        return defaultSeconds;
    const value = typeof raw === 'number' ? raw : Number(raw.trim());
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${variableName} must be a positive integer (seconds)`);
    }
    return value;
}
//# sourceMappingURL=auth-jwt.config.js.map