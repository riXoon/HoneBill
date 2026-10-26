"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_js_1 = require("../../infra/prisma/prisma.module.js");
const stellar_module_js_1 = require("../../infra/stellar/stellar.module.js");
const wallet_controller_js_1 = require("./wallet.controller.js");
const wallet_util_js_1 = require("./wallet.util.js");
let WalletModule = class WalletModule {
};
exports.WalletModule = WalletModule;
exports.WalletModule = WalletModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_js_1.PrismaModule, stellar_module_js_1.StellarModule],
        controllers: [wallet_controller_js_1.WalletController],
        providers: [wallet_util_js_1.WalletService],
        exports: [wallet_util_js_1.WalletService],
    })
], WalletModule);
//# sourceMappingURL=wallet.module.js.map