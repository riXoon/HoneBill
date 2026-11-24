import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { savedOfflineFeeCents } from '../services/offline/fees';
import { errorMessage } from '../services/api/client';
import { getConnectivity } from '../services/connectivity';
import { syncService } from '../services/sync/syncService';
import { drainConfirms } from '../services/sync/confirmOutbox';
import { drainFeedback } from '../services/sync/feedbackOutbox';
import { getHistory, getVaultBalance, getVoucherStatuses } from '../services/api/wallet';
import { toTransactions } from '../services/transactionMapper';
import {
  addOutcomeCounts,
  applyVoucherStatus,
  clearOtherWalletCaches,
  clearWalletCache,
  hasOutcomes,
  holdsOfflineFunds,
  NO_OUTCOMES,
  type SavedOutcomes,
  loadMoves,
  loadOutcomes,
  loadPending,
  loadSnapshot,
  normalizeNonce,
  saveMoves,
  saveOutcomes,
  savePending,
  saveSnapshot,
  saveWalletBalances,
  type PendingOffline,
} from '../services/walletCache';
import { isFinalTransaction, isUnconfirmed, type Transaction } from '../types/transaction';
import { useAuth } from './AuthContext';

/**
 * The signed-in account's balances and activity, read from the backend. One copy shared by Home, History,
 * the detail page and the amount checks on Send/Transfer, so they never disagree and do not refetch per screen.
 *
 * The last good read is also kept on the phone, so with no connection (or right after a restart) the screens show
 * it instead of nothing. Offline payments sent from this phone are listed as pending until the server's history
 * has them.
 */
export type Balances = { online: number; offline: number };
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type WalletData = {
  /** `null` until the first successful read (or a saved copy). */
  balances: Balances | null;
  /** Newest first: offline payments still waiting to settle, then what the server listed. */
  transactions: Transaction[];
  status: LoadStatus;
  /** Why the last refresh failed. Earlier data stays on screen. */
  error: string | null;
  /** Unix ms of the last read from the server, or of the saved copy being shown. `null` when there is neither. */
  syncedAt: number | null;
  /** Skips the request when the data is fresh, unless `force` is set. */
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** Pull-to-refresh: a full sync (queued work first, then fresh data). */
  syncNow: () => void;
  /** Saves a dispatched voucher for status checks, without authorizing an online submission. */
  trackOfflineDispatch: (payment: PendingOffline) => boolean;
  /**
   * Holds an offline payment's money the moment its voucher leaves the app (the messaging app opens with it, or its
   * QR is shown), whatever the person answers afterwards: from then on the voucher can settle at any time (sent later
   * from drafts, forwarded, relayed), so what can be spent must already exclude it. The server's answer releases the hold.
   */
  holdOffline: (payment: PendingOffline) => void;
  /** Undoes `holdOffline` for a voucher that provably never left the app (the messaging app failed to open). */
  releaseOfflineHold: (nonce: string) => void;
  /** Lists a move between the user's own wallets right away, until the server's history has it. */
  addLocalActivity: (entries: Transaction[]) => void;
  /** Pesos in offline payments awaiting confirmation or being processed (amount plus fee). */
  pendingOffline: number;
  /** Includes unconfirmed vouchers that can still settle by SMS during the original hold window. */
  heldOffline: number;
  /** Offline payments that settled or failed since the user last dismissed the notice, for Home to announce. */
  outcomes: PaymentOutcomes;
  dismissOutcomes: () => void;
};

export type PaymentOutcomes = SavedOutcomes;

const WalletDataContext = createContext<WalletData | undefined>(undefined);

const FRESH_MS = 15_000;
const HISTORY_LIMIT = 50;
/** Enough for months of use, and small enough to keep the saved copy tiny. */
const MAX_MOVES = 100;
/** The wallet read runs last in a sync, after steps that change what it returns (e.g. sending queued payments). */
const SYNC_ORDER_WALLET = 100;
const SYNC_ORDER_FEEDBACK = 30;
const SYNC_ORDER_CONFIRMS = 20;
const syncNow = () => syncService.requestSync();
const chainActivityKey = (tx: Transaction) => [tx.ref.toLowerCase(), tx.source, tx.direction].join(':');

const OFFLINE_MESSAGE = "You're offline. Connect to the internet to load your transactions.";

export function WalletDataProvider({ children }: { children: React.ReactNode }) {
  const { activeAccount, walletSignal } = useAuth();
  const [dataWallet, setDataWallet] = useState<AbortSignal | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [serverTransactions, setServerTransactions] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<PendingOffline[]>([]);
  const [moves, setMoves] = useState<Transaction[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<PaymentOutcomes>(NO_OUTCOMES);
  const request = useRef<AbortController | null>(null);
  const hydratedWallet = useRef<AbortSignal | null>(null);
  const loadedAt = useRef(0);
  // Latest values for code that runs after an await, where the render's copies may be stale.
  const balancesRef = useRef<Balances | null>(null);
  const serverRef = useRef<Transaction[]>([]);
  const pendingRef = useRef<PendingOffline[]>([]);
  const movesRef = useRef<Transaction[]>([]);
  const hasData = useRef(false);

  const shortId = activeAccount?.shortId ?? null;
  const publicKey = activeAccount?.stellarPublicKey ?? null;

  // Unseen outcomes are saved on every change, so the notice survives the app being closed before Home is opened.
  const outcomesRef = useRef<PaymentOutcomes>(NO_OUTCOMES);
  const putOutcomes = useCallback(
    (next: PaymentOutcomes) => {
      if (!walletSignal || walletSignal.aborted) return;
      outcomesRef.current = next;
      setOutcomes(next);
      if (publicKey) void saveOutcomes(publicKey, next);
    },
    [publicKey, walletSignal],
  );
  const addOutcomes = useCallback(
    (delta: Partial<PaymentOutcomes>) => {
      const next = addOutcomeCounts(outcomesRef.current, delta);
      if (hasOutcomes(addOutcomeCounts(NO_OUTCOMES, delta))) putOutcomes(next);
    },
    [putOutcomes],
  );

  const refresh = useCallback(
    async ({ force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}) => {
      if (!shortId || !publicKey || !walletSignal || walletSignal.aborted || signal?.aborted) return;
      if (hydratedWallet.current !== walletSignal) return;
      if (!force && (request.current || Date.now() - loadedAt.current < FRESH_MS)) return;

      // No connection: do not start a request that can only fail. A saved copy stays on screen as it is; with
      // nothing saved, say why the list is empty.
      if (!getConnectivity().online) {
        if (!hasData.current) {
          setError(OFFLINE_MESSAGE);
          setStatus('error');
        }
        return;
      }

      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      const abort = () => controller.abort();
      walletSignal.addEventListener('abort', abort);
      signal?.addEventListener('abort', abort);
      setStatus('loading');

      const account = { shortId, stellarPublicKey: publicKey };
      const balanceRequest = getVaultBalance(account, controller.signal).then((balance) => {
        if (!controller.signal.aborted) {
          const next = { online: balance.balancePHP, offline: balance.offlineBalancePHP };
          balancesRef.current = next;
          setBalances(next);
        }
        return balance;
      });
      const nonces = pendingRef.current.filter((payment) => !isFinalTransaction(payment)).map((payment) => payment.nonce);
      const [balance, history, voucherStatuses] = await Promise.allSettled([
        balanceRequest,
        getHistory(account, HISTORY_LIMIT, controller.signal),
        getVoucherStatuses(publicKey, nonces, controller.signal),
      ]);
      walletSignal.removeEventListener('abort', abort);
      signal?.removeEventListener('abort', abort);
      if (request.current !== controller || walletSignal.aborted) return;
      request.current = null;
      if (controller.signal.aborted) {
        setError(null);
        if (hasData.current || balancesRef.current) {
          setStatus('ready');
        } else if (!getConnectivity().online) {
          setError(OFFLINE_MESSAGE);
          setStatus('error');
        } else setStatus('idle');
        return;
      }

      let failure: unknown = balance.status === 'rejected' ? balance.reason : null;

      if (history.status === 'fulfilled') {
        const next = toTransactions(history.value);
        serverRef.current = next;
        setServerTransactions(next);
        hasData.current = true;

        const now = Date.now();
        setSyncedAt(now);

        // Server history replaces this phone's copy of the matching wallet activity.
        const listedRefs = new Set(next.map(chainActivityKey));
        const stillLocal = movesRef.current.filter((m) => !listedRefs.has(chainActivityKey(m)));
        if (stillLocal.length !== movesRef.current.length) {
          movesRef.current = stillLocal;
          setMoves(stillLocal);
          void saveMoves(publicKey, stillLocal);
        }

        void saveSnapshot(publicKey, { balances: balancesRef.current, transactions: next, savedAt: now });
      } else {
        failure = failure ?? history.reason;
        if (balance.status === 'fulfilled') {
          void saveWalletBalances(publicKey, {
            online: balance.value.balancePHP,
            offline: balance.value.offlineBalancePHP,
          });
        }
      }

      const listedByNonce = new Map(serverRef.current.flatMap((tx) => tx.nonce ? [[normalizeNonce(tx.nonce), tx] as const] : []));
      const statuses = new Map(voucherStatuses.status === 'fulfilled'
        ? voucherStatuses.value.map((result) => [normalizeNonce(result.nonce), result] as const) : []);
      const now = Date.now();
      const remaining: PendingOffline[] = [];
      let changed = false;
      const outcomes = { settled: 0, failed: 0, unconfirmed: 0 };
      for (const payment of pendingRef.current) {
        const nonce = normalizeNonce(payment.nonce);
        const listed = listedByNonce.get(nonce);
        const status = statuses.get(nonce);
        const finalHistory = listed && isFinalTransaction(listed);
        let updated: Transaction = payment;
        if (finalHistory) {
          updated = listed;
        } else if (!isFinalTransaction(payment)) {
          if (listed?.status === 'processing' && history.status === 'fulfilled' && (!status || status.status === 'NOT_FOUND')) {
            updated = applyVoucherStatus(payment, { nonce, status: 'PENDING',
              txHash: listed.ref === listed.nonce ? undefined : listed.ref }, now);
          } else if (status) {
            updated = applyVoucherStatus(payment, status, now);
          }
        }
        if (!finalHistory) remaining.push({ ...updated, nonce: payment.nonce });
        if (updated === payment && !finalHistory) continue;
        changed = true;
        if (isFinalTransaction(payment)) continue;
        if (updated.status === 'completed') outcomes.settled++;
        else if (isFinalTransaction(updated)) outcomes.failed++;
        else if (isUnconfirmed(updated) && !isUnconfirmed(payment)) outcomes.unconfirmed++;
      }
      if (changed) {
        pendingRef.current = remaining;
        setPending(remaining);
        void savePending(publicKey, remaining);
        addOutcomes(outcomes);
      }

      if (failure) {
        setError(errorMessage(failure));
        setStatus('error');
      } else {
        loadedAt.current = Date.now();
        setError(null);
        setStatus('ready');
      }
    },
    [shortId, publicKey, walletSignal, addOutcomes],
  );

  // A different (or no) account means nothing from the previous one may stay on screen. The saved copy for the new
  // account is shown first, so the screens have something while (or instead of) the network answers.
  useEffect(() => {
    let cancelled = false;
    request.current?.abort();
    hydratedWallet.current = null;
    loadedAt.current = 0;
    hasData.current = false;
    balancesRef.current = null;
    serverRef.current = [];
    pendingRef.current = [];
    movesRef.current = [];
    setBalances(null);
    setServerTransactions([]);
    setPending([]);
    setMoves([]);
    setSyncedAt(null);
    setError(null);
    setStatus('idle');
    setDataWallet(walletSignal);
    // Not saved: the previous account's notice stays stored for it, and this account's is loaded below.
    outcomesRef.current = NO_OUTCOMES;
    setOutcomes(NO_OUTCOMES);

    if (shortId && publicKey && walletSignal) {
      void (async () => {
        const [snapshot, savedPending, savedMoves, savedOutcomes] = await Promise.all([
          loadSnapshot(publicKey),
          loadPending(publicKey),
          loadMoves(publicKey),
          loadOutcomes(publicKey),
        ]);
        if (cancelled || walletSignal.aborted) return;
        // Added to anything announced while loading, so neither is lost.
        addOutcomes(savedOutcomes);
        if (snapshot) {
          balancesRef.current = snapshot.balances;
          serverRef.current = snapshot.transactions;
          setBalances(snapshot.balances);
          setServerTransactions(snapshot.transactions);
          setSyncedAt(snapshot.savedAt);
          hasData.current = true;
        }
        if (savedPending.length > 0) {
          pendingRef.current = savedPending;
          setPending(savedPending);
          hasData.current = true;
        }
        if (savedMoves.length > 0) {
          movesRef.current = savedMoves;
          setMoves(savedMoves);
          hasData.current = true;
        }
        if (hasData.current) setStatus('ready');
        hydratedWallet.current = walletSignal;
        await refresh({ force: true });
      })();
    }
    return () => {
      cancelled = true;
      request.current?.abort();
      request.current = null;
    };
  }, [shortId, publicKey, walletSignal, refresh, addOutcomes]);

  // The sync service decides when to read fresh data (reconnect, back on screen, interval, pull-to-refresh). After a
  // reconnect or a pull the data is re-read even if recent; the others skip it while it is still fresh.
  useEffect(() => {
    if (!shortId || !publicKey) return;
    return syncService.registerStep(
      'wallet',
      ({ trigger, signal }) => refresh({ force: trigger === 'reconnect' || trigger === 'manual', signal }),
      SYNC_ORDER_WALLET,
    );
  }, [shortId, publicKey, refresh]);

  // Settlement confirmations for moves and online transfers are sent before the History read.
  useEffect(() => {
    if (!publicKey) return;
    return syncService.registerStep(
      'confirms',
      async ({ signal }) => {
        if (!getConnectivity().online) return;
        await drainConfirms(publicKey, signal);
      },
      SYNC_ORDER_CONFIRMS,
    );
  }, [publicKey]);

  // Help & Feedback reports written offline go out on the next sync. After the payment steps, which matter more.
  useEffect(() => {
    if (!publicKey) return;
    return syncService.registerStep(
      'feedback',
      async ({ signal }) => {
        if (!getConnectivity().online) return;
        await drainFeedback(publicKey, signal);
      },
      SYNC_ORDER_FEEDBACK,
    );
  }, [publicKey]);

  // A different account signing in removes what this phone kept for any other account. Locking or signing out does
  // not: the same person comes back with their MPIN or fingerprint, often with no connection, and the saved copy is
  // what Home shows until the network answers.
  const lastSignedInKey = useRef<string | null>(null);
  useEffect(() => {
    if (!publicKey) return;
    if (lastSignedInKey.current && lastSignedInKey.current !== publicKey) void clearWalletCache(lastSignedInKey.current);
    lastSignedInKey.current = publicKey;
    void clearOtherWalletCaches(publicKey);
  }, [publicKey]);

  const holdOffline = useCallback(
    (payment: PendingOffline) => {
      if (!publicKey || !walletSignal || walletSignal.aborted) return;
      const nonce = normalizeNonce(payment.nonce);
      if (pendingRef.current.some((p) => normalizeNonce(p.nonce) === nonce)) return;
      const next = [payment, ...pendingRef.current];
      pendingRef.current = next;
      hasData.current = true;
      setPending(next);
      void savePending(publicKey, next);
    },
    [publicKey, walletSignal],
  );

  const releaseOfflineHold = useCallback(
    (nonce: string) => {
      if (!publicKey || !walletSignal || walletSignal.aborted) return;
      const key = normalizeNonce(nonce);
      const next = pendingRef.current.filter((p) => !(normalizeNonce(p.nonce) === key && p.status === 'pending'));
      if (next.length === pendingRef.current.length) return;
      pendingRef.current = next;
      setPending(next);
      void savePending(publicKey, next);
    },
    [publicKey, walletSignal],
  );

  const trackOfflineDispatch = useCallback(
    (payment: PendingOffline) => {
      if (!publicKey || !walletSignal || walletSignal.aborted) return false;
      const nonce = normalizeNonce(payment.nonce);
      if (serverRef.current.some((tx) => tx.nonce && normalizeNonce(tx.nonce) === nonce && isFinalTransaction(tx))) {
        return true;
      }
      holdOffline(payment);
      if (getConnectivity().online) syncService.requestSync({ afterCurrent: true });
      return true;
    },
    [publicKey, walletSignal, holdOffline],
  );

  const addLocalActivity = useCallback(
    (entries: Transaction[]) => {
      if (!publicKey || !walletSignal || walletSignal.aborted || entries.length === 0) return;
      const known = new Set(movesRef.current.map((m) => m.id));
      const fresh = entries.filter((e) => !known.has(e.id));
      if (fresh.length === 0) return;
      const next = [...fresh, ...movesRef.current].slice(0, MAX_MOVES);
      movesRef.current = next;
      hasData.current = true;
      setMoves(next);
      void saveMoves(publicKey, next);
    },
    [publicKey, walletSignal],
  );

  const transactions = useMemo(() => {
    const listed = new Set(serverTransactions.flatMap((tx) => (tx.nonce ? [normalizeNonce(tx.nonce)] : [])));
    const waiting = pending.filter((p) => !listed.has(normalizeNonce(p.nonce)));
    const localByNonce = new Map(pending.map((p) => [normalizeNonce(p.nonce), p]));
    const serverHistory = serverTransactions.map((tx) => {
      const local = tx.nonce && localByNonce.get(normalizeNonce(tx.nonce));
      return local && !isFinalTransaction(tx) && isFinalTransaction(local)
        ? { ...tx, status: local.status, ref: local.ref, failureReason: local.failureReason } : tx;
    });
    const listedRefs = new Set(serverTransactions.map(chainActivityKey));
    const localMoves = moves.filter((m) => !listedRefs.has(chainActivityKey(m)));
    if (waiting.length === 0 && localMoves.length === 0) return serverHistory;
    return [...waiting, ...localMoves, ...serverHistory].sort((a, b) => b.timestamp - a.timestamp);
  }, [serverTransactions, pending, moves]);

  const { pendingOffline, heldOffline } = useMemo(() => {
    let pendingCents = 0;
    let heldCents = 0;
    for (const p of pending) {
      if (p.direction !== 'out' || !holdsOfflineFunds(p, syncedAt)) continue;
      const totalCents = Math.round(p.amount * 100) + savedOfflineFeeCents(p.feeCents, p.assetCode);
      if (p.status === 'pending' || p.status === 'processing') pendingCents += totalCents;
      heldCents += totalCents;
    }
    return { pendingOffline: pendingCents / 100, heldOffline: heldCents / 100 };
  }, [pending, syncedAt]);
  const dismissOutcomes = useCallback(() => putOutcomes(NO_OUTCOMES), [putOutcomes]);

  // The new unlock can render before the cache-loading effect resets the previous unlock's data.
  const ownsData = walletSignal !== null && dataWallet === walletSignal;
  const value = useMemo<WalletData>(
    () => ({
      balances: ownsData ? balances : null,
      transactions: ownsData ? transactions : [],
      status: ownsData ? status : 'idle',
      error: ownsData ? error : null,
      syncedAt: ownsData ? syncedAt : null,
      refresh,
      syncNow,
      trackOfflineDispatch,
      holdOffline,
      releaseOfflineHold,
      addLocalActivity,
      pendingOffline: ownsData ? pendingOffline : 0,
      heldOffline: ownsData ? heldOffline : 0,
      outcomes: ownsData ? outcomes : NO_OUTCOMES,
      dismissOutcomes,
    }),
    [
      ownsData,
      balances,
      transactions,
      status,
      error,
      syncedAt,
      refresh,
      trackOfflineDispatch,
      holdOffline,
      releaseOfflineHold,
      addLocalActivity,
      pendingOffline,
      heldOffline,
      outcomes,
      dismissOutcomes,
    ],
  );

  return <WalletDataContext.Provider value={value}>{children}</WalletDataContext.Provider>;
}

export function useWalletData(): WalletData {
  const context = useContext(WalletDataContext);
  if (context === undefined) {
    throw new Error('useWalletData must be used within a WalletDataProvider');
  }
  return context;
}
