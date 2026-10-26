"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_module_js_1 = require("../../infra/redis/redis.module.js");
const accounts_controller_js_1 = require("./accounts.controller.js");
const accounts_service_js_1 = require("./accounts.service.js");
let AccountsModule = class AccountsModule {
};
exports.AccountsModule = AccountsModule;
exports.AccountsModule = AccountsModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, redis_module_js_1.RedisModule],
        controllers: [accounts_controller_js_1.AccountsController],
        providers: [accounts_service_js_1.AccountsService],
        exports: [accounts_service_js_1.AccountsService],
    })
], AccountsModule);
//# sourceMappingURL=accounts.module.js.map