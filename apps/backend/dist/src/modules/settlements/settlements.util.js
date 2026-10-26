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
exports.SettlementsService = void 0;
exports.parseSettlementSmsBody = parseSettlementSmsBody;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../../infra/prisma/prisma.service.js");
function parseSettlementSmsBody(smsBody) {
    const payload = (smsBody ?? '').trim();
    const parts = payload.split(':');
    if (parts.length !== 6) {
        throw new common_1.BadRequestException('Malformed smsBody');
    }
    const [tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature] = parts;
    if (!tokenId || !senderShortId || !receiverShortId || !amountBase62 || !nonce || !signature) {
        throw new common_1.BadRequestException('Malformed smsBody');
    }
    return { tokenId, senderShortId, receiverShortId, amountBase62, nonce, signature };
}
let SettlementsService = class SettlementsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async processSettlement(smsBody) {
        const payload = parseSettlementSmsBody(smsBody);
        const existing = await this.prisma.settlement.findUnique({ where: { nonce: payload.nonce } }).catch(() => null);
        if (existing) {
            return { txHash: existing.txHash, status: existing.status, duplicate: true };
        }
        const token = await this.prisma.token.findFirst({ orderBy: { id: 'asc' } }).catch(() => null);
        if (!token) {
            return { txHash: null, status: 'SETTLED', notes: 'No token configuration found; settlement accepted as dry-run.' };
        }
        return {
            txHash: null,
            status: 'SETTLED',
            tokenSymbol: token.symbol,
            senderShortId: payload.senderShortId,
            receiverShortId: payload.receiverShortId,
            amountBase62: payload.amountBase62,
            nonce: payload.nonce,
        };
    }
};
exports.SettlementsService = SettlementsService;
exports.SettlementsService = SettlementsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], SettlementsService);
//# sourceMappingURL=settlements.util.js.map