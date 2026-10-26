"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBase62Id = generateBase62Id;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generateBase62Id(length = 6) {
    let value = '';
    for (let index = 0; index < length; index += 1) {
        const randomIndex = Math.floor(Math.random() * ALPHABET.length);
        value += ALPHABET[randomIndex];
    }
    return value;
}
//# sourceMappingURL=short-id.util.js.map