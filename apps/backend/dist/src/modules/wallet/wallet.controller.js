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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletController = void 0;
const common_1 = require("@nestjs/common");
const wallet_util_js_1 = require("./wallet.util.js");
let WalletController = class WalletController {
    walletService;
    constructor(walletService) {
        this.walletService = walletService;
    }
    getBalance(publicKey, assetCode) {
        return this.walletService.getBalance(publicKey ?? '', assetCode ?? '');
    }
    getHistory(shortId, publicKey) {
        return this.walletService.getHistory(shortId, publicKey);
    }
    getVaultBalance(shortId, publicKey) {
        return this.walletService.getVaultBalance(shortId, publicKey);
    }
    getTransactions(shortId, limit) {
        return this.walletService.getTransactions(shortId ?? '', Number(limit ?? 50));
    }
    confirmTransfer(body) {
        return this.walletService.confirmTransfer(body?.txHash ?? '');
    }
};
exports.WalletController = WalletController;
__decorate([
    (0, common_1.Get)('wallet/balance'),
    __param(0, (0, common_1.Query)('publicKey')),
    __param(1, (0, common_1.Query)('assetCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Get)('wallet/history'),
    __param(0, (0, common_1.Query)('shortId')),
    __param(1, (0, common_1.Query)('publicKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Get)('vault-balance'),
    __param(0, (0, common_1.Query)('shortId')),
    __param(1, (0, common_1.Query)('publicKey')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "getVaultBalance", null);
__decorate([
    (0, common_1.Get)('transactions'),
    __param(0, (0, common_1.Query)('shortId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "getTransactions", null);
__decorate([
    (0, common_1.Post)('wallet/transfers/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WalletController.prototype, "confirmTransfer", null);
exports.WalletController = WalletController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [wallet_util_js_1.WalletService])
], WalletController);
//# sourceMappingURL=wallet.controller.js.map