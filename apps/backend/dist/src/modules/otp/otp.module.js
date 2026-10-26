"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpModule = void 0;
const common_1 = require("@nestjs/common");
const redis_module_js_1 = require("../../infra/redis/redis.module.js");
const otp_rate_limit_service_js_1 = require("../../infra/redis/otp-rate-limit.service.js");
const otp_controller_js_1 = require("./otp.controller.js");
const otp_service_js_1 = require("./otp.service.js");
const textbee_service_js_1 = require("./textbee.service.js");
let OtpModule = class OtpModule {
};
exports.OtpModule = OtpModule;
exports.OtpModule = OtpModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_js_1.RedisModule],
        controllers: [otp_controller_js_1.OtpController],
        providers: [otp_service_js_1.OtpService, otp_rate_limit_service_js_1.OtpRateLimitService, textbee_service_js_1.TextbeeService],
        exports: [otp_service_js_1.OtpService],
    })
], OtpModule);
//# sourceMappingURL=otp.module.js.map