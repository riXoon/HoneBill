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
exports.OtpController = void 0;
const common_1 = require("@nestjs/common");
const otp_service_js_1 = require("./otp.service.js");
let OtpController = class OtpController {
    otpService;
    constructor(otpService) {
        this.otpService = otpService;
    }
    send(body, req) {
        const phone = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
        const forwardedFor = req.headers['x-forwarded-for'];
        const firstForwardedIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
            ?.split(',')[0]
            ?.trim();
        const realIpHeader = req.headers['x-real-ip'];
        const realIp = (Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader)?.trim();
        return this.otpService.send(phone, firstForwardedIp || realIp || req.ip || '127.0.0.1');
    }
    verify(body) {
        const phone = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
        const code = typeof body?.code === 'string' ? body.code : '';
        return this.otpService.verify(phone, code);
    }
};
exports.OtpController = OtpController;
__decorate([
    (0, common_1.Post)('send'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OtpController.prototype, "send", null);
__decorate([
    (0, common_1.Post)('verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OtpController.prototype, "verify", null);
exports.OtpController = OtpController = __decorate([
    (0, common_1.Controller)('otp'),
    __metadata("design:paramtypes", [otp_service_js_1.OtpService])
], OtpController);
//# sourceMappingURL=otp.controller.js.map