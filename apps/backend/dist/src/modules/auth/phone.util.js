"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhoneNumber = normalizePhoneNumber;
exports.toDbPhone = toDbPhone;
exports.isPlausiblePhone = isPlausiblePhone;
function normalizePhoneNumber(phone) {
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('09') && cleaned.length === 11) {
        return `+63${cleaned.substring(1)}`;
    }
    if (cleaned.startsWith('63') && cleaned.length === 12) {
        return `+${cleaned}`;
    }
    if (!cleaned.startsWith('+')) {
        return `+${cleaned}`;
    }
    return cleaned;
}
function toDbPhone(phone) {
    return normalizePhoneNumber(phone).replace(/\D/g, '');
}
function isPlausiblePhone(phone) {
    const digits = toDbPhone(phone);
    return digits.length >= 8 && digits.length <= 15;
}
//# sourceMappingURL=phone.util.js.map