"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_PHPC_OFFLINE_FEE_STROOPS = void 0;
exports.offlineFeeStroops = offlineFeeStroops;
exports.LEGACY_PHPC_OFFLINE_FEE_STROOPS = 5000000n;
/** Fee in stroops for one offline payment, with inclusive upper bounds. */
function offlineFeeStroops(amountStroops, tokenSymbol) {
    if (tokenSymbol !== 'PHPC' || amountStroops <= 0n)
        return 0n;
    if (amountStroops <= 1000000000n)
        return exports.LEGACY_PHPC_OFFLINE_FEE_STROOPS;
    if (amountStroops <= 5000000000n)
        return 15000000n;
    if (amountStroops <= 10000000000n)
        return 30000000n;
    if (amountStroops <= 50000000000n)
        return 75000000n;
    return 150000000n;
}
