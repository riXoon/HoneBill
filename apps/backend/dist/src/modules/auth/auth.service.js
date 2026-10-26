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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const stellar_service_js_1 = require("../../infra/stellar/stellar.service.js");
const auth_jwt_config_js_1 = require("./auth-jwt.config.js");
let AuthService = AuthService_1 = class AuthService {
    configService;
    jwtService;
    stellar;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(configService, jwtService, stellar) {
        this.configService = configService;
        this.jwtService = jwtService;
        this.stellar = stellar;
    }
    get serverKeypair() {
        const seed = this.configService.get('SECRET_SEP10_SIGNING_SEED');
        if (!seed)
            throw new common_1.InternalServerErrorException('SECRET_SEP10_SIGNING_SEED is required');
        return stellar_sdk_1.Keypair.fromSecret(seed);
    }
    get homeDomains() {
        const raw = this.configService.get('SEP10_HOME_DOMAINS');
        if (!raw)
            throw new common_1.InternalServerErrorException('SEP10_HOME_DOMAINS is required');
        return raw.split(',').map((d) => d.trim()).filter(Boolean);
    }
    get networkPassphrase() {
        return this.stellar.networkPassphrase;
    }
    get tokenIssuer() {
        return this.homeDomains[0];
    }
    getChallenge(account, memo) {
        if (!account) {
            throw new common_1.BadRequestException("Missing required query parameter: 'account'");
        }
        if (!stellar_sdk_1.StrKey.isValidEd25519PublicKey(account)) {
            throw new common_1.BadRequestException(`Invalid Stellar account address: ${account}`);
        }
        if (memo !== undefined && !/^\d+$/.test(memo)) {
            throw new common_1.BadRequestException('Invalid memo');
        }
        const homeDomain = this.homeDomains[0];
        const timeout = (0, auth_jwt_config_js_1.parseTtl)(this.configService.get('SEP10_AUTH_TIMEOUT'), 'SEP10_AUTH_TIMEOUT', 900);
        const transaction = stellar_sdk_1.WebAuth.buildChallengeTx(this.serverKeypair, account, homeDomain, timeout, this.networkPassphrase, homeDomain, memo);
        return { transaction, network_passphrase: this.networkPassphrase };
    }
    async issueToken(transaction) {
        if (!transaction?.trim()) {
            throw new common_1.BadRequestException("Missing required field in body: 'transaction'");
        }
        const server = this.serverKeypair.publicKey();
        const homeDomains = this.homeDomains;
        const primaryDomain = homeDomains[0];
        let clientAccountID;
        let memo;
        try {
            ({ clientAccountID, memo } = stellar_sdk_1.WebAuth.readChallengeTx(transaction, server, this.networkPassphrase, homeDomains, primaryDomain));
            const record = await this.stellar.horizonServer.loadAccount(clientAccountID);
            const signers = record.signers;
            const totalWeight = signers.reduce((sum, s) => sum + s.weight, 0);
            stellar_sdk_1.WebAuth.verifyChallengeTxThreshold(transaction, server, this.networkPassphrase, totalWeight, signers, homeDomains, primaryDomain);
        }
        catch (err) {
            this.logger.debug(`SEP-10 verification failed: ${err.message}`);
            throw new common_1.UnauthorizedException('SEP-10 challenge verification failed. Ensure the challenge is signed correctly and has not expired.');
        }
        const token = this.jwtService.sign({
            sub: clientAccountID,
            iss: primaryDomain,
            ...(memo != null ? { memo } : {}),
        });
        return { token };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        jwt_1.JwtService,
        stellar_service_js_1.StellarService])
], AuthService);
//# sourceMappingURL=auth.service.js.map