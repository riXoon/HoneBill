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
exports.TextbeeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let TextbeeService = class TextbeeService {
    config;
    constructor(config) {
        this.config = config;
    }
    async send(phoneNumber, message, options = {}) {
        const primary = this.getGatewayConfig('TEXTBEE_GATEWAY_URL', 'TEXTBEE_API_KEY');
        if (!primary) {
            throw new common_1.ServiceUnavailableException('TextBee SMS gateway is not configured.');
        }
        const fallback = this.getGatewayConfig('TEXTBEE_FALLBACK_GATEWAY_URL', 'TEXTBEE_FALLBACK_API_KEY');
        const retries = Math.max(0, Math.min(5, Number(options.retries ?? this.config.get('TEXTBEE_RETRIES') ?? 2)));
        const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? this.config.get('TEXTBEE_TIMEOUT_MS') ?? 4500));
        const deadline = options.deadlineMs === undefined ? undefined : Date.now() + options.deadlineMs;
        const gateways = fallback ? [primary, fallback] : [primary];
        for (const gateway of gateways) {
            for (let attempt = 0; attempt <= retries; attempt += 1) {
                const remainingMs = deadline === undefined ? timeoutMs : deadline - Date.now();
                if (remainingMs <= 0)
                    break;
                try {
                    const response = await fetch(gateway.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': gateway.apiKey,
                        },
                        body: JSON.stringify({ recipients: [phoneNumber], message }),
                        signal: AbortSignal.timeout(Math.min(timeoutMs, remainingMs)),
                    });
                    if (response.ok) {
                        return;
                    }
                }
                catch {
                }
                if (attempt < retries) {
                    const backoffMs = 100 * (attempt + 1);
                    const timeUntilDeadline = deadline === undefined ? backoffMs : deadline - Date.now();
                    if (timeUntilDeadline <= 0)
                        break;
                    await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, timeUntilDeadline)));
                }
            }
        }
        throw new common_1.BadGatewayException('TextBee could not deliver the verification message.');
    }
    getGatewayConfig(urlKey, apiKeyKey) {
        const url = this.config.get(urlKey)?.trim();
        const apiKey = this.config.get(apiKeyKey)?.trim();
        return url && apiKey ? { url, apiKey } : null;
    }
};
exports.TextbeeService = TextbeeService;
exports.TextbeeService = TextbeeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TextbeeService);
//# sourceMappingURL=textbee.service.js.map