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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarRpcHealthIndicator = void 0;
const common_1 = require("@nestjs/common");
const terminus_1 = require("@nestjs/terminus");
const stellar_service_1 = require("../../../infra/stellar/stellar.service");
let StellarRpcHealthIndicator = class StellarRpcHealthIndicator extends terminus_1.HealthIndicator {
    stellarService;
    constructor(stellarService) {
        super();
        this.stellarService = stellarService;
    }
    async pingCheck(key) {
        try {
            const response = await fetch(this.stellarService.sorobanRpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    id: 1,
                    jsonrpc: '2.0',
                    method: 'getHealth',
                    params: [],
                }),
            });
            if (!response.ok) {
                throw new Error(`RPC status ${response.status}`);
            }
            return this.getStatus(key, true);
        }
        catch (error) {
            throw new terminus_1.HealthCheckError('Soroban RPC check failed', this.getStatus(key, false, { message: error.message }));
        }
    }
};
exports.StellarRpcHealthIndicator = StellarRpcHealthIndicator;
exports.StellarRpcHealthIndicator = StellarRpcHealthIndicator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [stellar_service_1.StellarService])
], StellarRpcHealthIndicator);
//# sourceMappingURL=stellar-rpc.health.js.map