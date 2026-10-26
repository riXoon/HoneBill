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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const accounts_service_js_1 = require("../accounts/accounts.service.js");
const auth_service_js_1 = require("./auth.service.js");
const throttler_1 = require("@nestjs/throttler");
let AuthController = class AuthController {
    authService;
    accountsService;
    constructor(authService, accountsService) {
        this.authService = authService;
        this.accountsService = accountsService;
    }
    getChallenge(account, memo) {
        return this.authService.getChallenge(typeof account === 'string' ? account : undefined, typeof memo === 'string' ? memo : undefined);
    }
    postChallenge(body) {
        const transaction = typeof body?.transaction === 'string' ? body.transaction : '';
        return this.authService.issueToken(transaction);
    }
    verifyPin(body) {
        const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
        const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
        return this.accountsService.verifyPin(phoneNumber, pin);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('account')),
    __param(1, (0, common_1.Query)('memo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getChallenge", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "postChallenge", null);
__decorate([
    (0, common_1.Post)('pin/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60_000 } }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyPin", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_js_1.AuthService,
        accounts_service_js_1.AccountsService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map