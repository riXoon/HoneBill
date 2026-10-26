"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const accounts_module_js_1 = require("../accounts/accounts.module.js");
const auth_controller_js_1 = require("./auth.controller.js");
const auth_service_js_1 = require("./auth.service.js");
const auth_jwt_config_js_1 = require("./auth-jwt.config.js");
const stellar_module_js_1 = require("../../infra/stellar/stellar.module.js");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            accounts_module_js_1.AccountsModule,
            stellar_module_js_1.StellarModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => {
                    const secret = config.get('SECRET_SEP10_JWT_SECRET');
                    if (!secret) {
                        throw new Error('SECRET_SEP10_JWT_SECRET is required');
                    }
                    return {
                        secret,
                        signOptions: {
                            algorithm: 'HS256',
                            expiresIn: (0, auth_jwt_config_js_1.parseTtl)(config.get('SEP10_JWT_TIMEOUT')),
                        },
                    };
                },
            }),
        ],
        controllers: [auth_controller_js_1.AuthController],
        providers: [auth_service_js_1.AuthService],
        exports: [auth_service_js_1.AuthService, jwt_1.JwtModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map