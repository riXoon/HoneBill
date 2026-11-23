import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Networks, rpc } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { stellarNetworkId } from '../../infra/stellar/network-id.js';
import { isLedgerNumber, isTransactionHash } from '../settlements/spend-event.util.js';
import { withinSettlementDeadline } from '../settlements/settlement-rpc-deadline.js';
import { walletEventTopics, type WalletEffect } from './wallet-chain-evidence.js';
import { WalletConfirmationService } from './wallet-confirmation.service.js';

const PAGE_SIZE = 8;
const SWEEP_MS = 40_000;
const PAGE_MS = 8_000;

@Injectable()
export class WalletHistoryRecoveryService {
  private readonly logger = new Logger(WalletHistoryRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
    private readonly confirmation: WalletConfirmationService,
  ) {}

  async run() {
    const mode = this.config.get<string>('WALLET_HISTORY_RECONCILE_MODE');
    if (mode !== 'observe' && mode !== 'apply') return { mode: 'off' };
    const passphrase = this.stellar.networkPassphrase;
    if (passphrase !== Networks.TESTNET) throw new ServiceUnavailableException('Wallet history reconciliation requires Stellar Testnet');
    const deadline = Date.now() + SWEEP_MS;
    const network = await withinSettlementDeadline(() => this.stellar.sorobanServer.getNetwork(), Date.now() + PAGE_MS);
    if (network.passphrase !== passphrase) throw new ServiceUnavailableException('Wallet history RPC is on the wrong network');

    const vault = this.config.getOrThrow<string>('CONTRACT_ID');
    const tokens = await this.prisma.token.findMany({ select: { id: true, contractId: true }, orderBy: { id: 'asc' } });
    const tokenIds = new Map(tokens.map(({ id, contractId }) => [contractId, id]));
    const watched = [vault, ...tokenIds.keys()].filter((id, i, list) => list.indexOf(id) === i);
    const stats = { mode, pages: 0, verified: 0, created: 0, updated: 0, conflicts: 0, skipped: 0, errors: 0 };
    const startLedger = this.config.get<number>('WALLET_HISTORY_RECONCILE_START_LEDGER');
    const networkId = stellarNetworkId(passphrase);

    for (const contract of watched) {
      if (Date.now() >= deadline) break;
      // Apply starts its own scan so observation never consumes events that still need projecting.
      const scope = [networkId, vault, mode, contract].join(':');
      try {
        const page = await this.processPage(
          scope, contract, contract === vault, tokenIds, mode === 'apply', startLedger,
          Math.min(deadline, Date.now() + PAGE_MS),
        );
        if (!page) continue;
        stats.pages += 1;
        stats.verified += page.verified;
        stats.created += page.created;
        stats.updated += page.updated;
        stats.conflicts += page.conflicts;
        stats.skipped += page.skipped;
      } catch {
        stats.errors += 1;
        this.logger.warn('Wallet history page did not advance. Check RPC connectivity, retention and the configured starting ledger.');
      }
    }
    this.logger.log(`Wallet history reconciliation ${JSON.stringify(stats)}`);
    return stats;
  }

  private async processPage(
    scope: string,
    contract: string,
    isVault: boolean,
    tokenIds: ReadonlyMap<string, number>,
    apply: boolean,
    startLedger: number | undefined,
    deadline: number,
  ) {
    const checkpoint = await this.prisma.walletHistoryCursor.findUnique({ where: { scope } });
    const cursor = checkpoint?.cursor;
    if (!cursor && (startLedger === undefined || !isLedgerNumber(startLedger))) throw new Error('Missing wallet history start ledger');
    const topics = isVault
      ? [[walletEventTopics.deposit, '*', '*'], [walletEventTopics.withdraw, '*', '*']]
      : [[walletEventTopics.transfer, '*', '*'], [walletEventTopics.transfer, '*', '*', '*']];
    const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contract], topics }];
    const page = await withinSettlementDeadline(() => this.stellar.sorobanServer.getEvents(cursor
      ? { cursor, filters, limit: PAGE_SIZE }
      : { startLedger: startLedger!, filters, limit: PAGE_SIZE }), deadline);
    if (!page.cursor || (page.cursor === cursor && page.events.length)) throw new Error('Invalid wallet history cursor');
    if (page.cursor === cursor) return null;

    const effects = new Map<string, WalletEffect | null>();
    for (const event of page.events) {
      if (event.inSuccessfulContractCall === false) continue;
      if (event.contractId?.contractId() !== contract || event.type !== 'contract' ||
          !isTransactionHash(event.txHash) || !isLedgerNumber(event.ledger)) throw new Error('Invalid wallet history event');
      if (effects.has(event.txHash)) continue;
      const chain = await this.confirmation.readTransaction(event.txHash, deadline);
      if ((chain.status !== rpc.Api.GetTransactionStatus.SUCCESS && chain.status !== rpc.Api.GetTransactionStatus.FAILED) ||
          chain.txHash !== event.txHash || chain.ledger !== event.ledger) throw new Error('Wallet history transaction is unavailable');
      const effect = chain.status === rpc.Api.GetTransactionStatus.SUCCESS ? this.confirmation.effect(chain, event.txHash) : null;
      const matchesStream = effect && (isVault ? effect.kind === 'move' : effect.kind === 'transfer' && effect.token === contract);
      effects.set(event.txHash, matchesStream ? effect : null);
    }
    const supported = [...effects.values()].flatMap((effect) => {
      const tokenId = effect ? tokenIds.get(effect.token) : undefined;
      return effect && tokenId !== undefined ? [{ effect, tokenId }] : [];
    });

    return this.prisma.$transaction(async (tx) => {
      const claimed = cursor
        ? await tx.walletHistoryCursor.updateMany({ where: { scope, cursor }, data: { cursor: page.cursor } })
        : await tx.walletHistoryCursor.createMany({ data: { scope, cursor: page.cursor }, skipDuplicates: true });
      if (!claimed.count) return null;
      const participantKeys = [...new Set(supported.flatMap(({ effect }) =>
        effect.kind === 'transfer' ? [effect.sender, effect.recipient] : [effect.sender]))];
      const accounts = participantKeys.length
        ? await tx.account.findMany({ where: { stellarPublicKey: { in: participantKeys } }, select: { stellarPublicKey: true } })
        : [];
      const registered = new Set(accounts.map(({ stellarPublicKey }) => stellarPublicKey));
      const stats = { verified: 0, created: 0, updated: 0, conflicts: 0, skipped: effects.size };
      for (const { effect, tokenId } of supported) {
        if (!registered.has(effect.sender) && !(effect.kind === 'transfer' && registered.has(effect.recipient))) continue;
        stats.verified += 1;
        stats.skipped -= 1;
        if (!apply) continue;
        const result = await this.confirmation.persist(tx, effect, tokenId, true);
        if (result === 'created') stats.created += 1;
        if (result === 'updated') stats.updated += 1;
        if (result === 'conflict') stats.conflicts += 1;
      }
      return stats;
    });
  }
}
