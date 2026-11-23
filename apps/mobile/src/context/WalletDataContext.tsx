import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { savedOfflineFeeCents } from '../services/offline/fees';
import { errorMessage } from '../services/api/client';
import { getConnectivity } from '../services/connectivity';
import { reportError } from '../services/errorReporting';
import { syncService } from '../services/sync/syncService';
import { drainConfirms } from '../services/sync/confirmOutbox';
import { drainFeedback } from '../services/sync/feedbackOutbox';
import {
  acceptVoucherReview,
  dismissVoucherReview,
  drainVouchers,
  listVoucherReviews,
  rememberVoucherForReview,
  type VoucherReview,
} from '../services/sync/voucherOutbox';
import { getHistory, getVaultBalance } from '../services/api/wallet';
import { toTransactions } from '../services/transactionMapper';
import {
  addOutcomeCounts,
  agePending,
  clearOtherWalletCaches,
  clearWalletCache,
  EXPIRED_REASON,
  hasOutcomes,
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
import type { Transaction } from '../types/transaction';
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
  trackOfflineDispatch: (payment: PendingOffline, voucher: string) => boolean;
  voucherReviews: VoucherReview[];
  answerVoucherReview: (review: VoucherReview, payment: PendingOffline | null) => boolean;
  /**
   * Holds an offline payment's money the moment its voucher leaves the app (the messaging app opens with it, or its
   * QR is shown), whatever the person answers afterwards: from then on the voucher can settle at any time (sent later
   * from drafts, forwarded, relayed), so what can be spent must already exclude it. The server's answer releases the hold.
   */
  holdOffline: (payment: PendingOffline) => void;
  /** Undoes `holdOffline` for a voucher that provably never left the app (the messaging app failed to open). */
  releaseOfflineHold: (nonce: string) => void;
  /** Lists a move between the user's own wallets right away, until the server's history has it. */
  addMoves: (entries: Transaction[]) => void;
  /**
   * Pesos already committed by offline payments still waiting to settle (amount plus fee). The vault balance does not
   * drop until a voucher settles, so this is what the screens subtract to show what can still be spent.
   */
  pendingOffline: number;
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
const SYNC_ORDER_VOUCHERS = 10;
const SYNC_ORDER_FEEDBACK = 30;
const SYNC_ORDER_CONFIRMS = 20;
const syncNow = () => syncService.requestSync();
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
  const [voucherReviews, setVoucherReviews] = useState<VoucherReview[]>([]);
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

  /**
   * Turns payments nobody confirmed in time into "unconfirmed" ones, and announces them. Runs only right after a
   * successful history read, never offline: with no connection the phone cannot know whether a payment settled (the
   * text may have got through), so its money stays held back however long the phone is offline. Once the server has
   * answered, its balance already reflects whatever did settle, so releasing the hold is safe then.
   */
  const expirePending = useCallback(() => {
    if (!publicKey) return;
    const { items, expired, changed } = agePending(pendingRef.current, Date.now());
    if (!changed) return;
    pendingRef.current = items;
    setPending(items);
    void savePending(publicKey, items);
    addOutcomes({ unconfirmed: expired });
  }, [publicKey, addOutcomes]);

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
      const [balance, history] = await Promise.allSettled([
        balanceRequest,
        getHistory(account, HISTORY_LIMIT, controller.signal),
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
        if (balance.status === 'fulfilled') {
          try {
            const reviews = listVoucherReviews(publicKey, next, balance.value.offlineBalancePHP, now);
            setVoucherReviews((current) => (current.length || reviews.length ? reviews : current));
          } catch (error) {
            setVoucherReviews([]);
            reportError(error, { step: 'listVoucherReviews' });
          }
        } else {
          setVoucherReviews([]);
        }

        // Moves between the user's own wallets that the server now lists no longer need this phone's copy.
        const listedRefs = new Set(next.map((tx) => tx.ref));
        const stillLocal = movesRef.current.filter((m) => !listedRefs.has(m.ref));
        if (stillLocal.length !== movesRef.current.length) {
          movesRef.current = stillLocal;
          setMoves(stillLocal);
          void saveMoves(publicKey, stillLocal);
        }

        // Payments this phone sent that the server lists as decided no longer need a placeholder, and are announced.
        // One the server lists as still pending keeps its placeholder (hidden behind the server's copy) until then,
        // so its outcome is announced too, and its amount stays held back from what can be spent.
        const decided = new Map(
          next.flatMap((tx) => (tx.nonce && tx.status !== 'pending' ? [[normalizeNonce(tx.nonce), tx.status] as const] : [])),
        );
        const remaining: PendingOffline[] = [];
        let settled = 0;
        let failed = 0;
        for (const p of pendingRef.current) {
          const outcome = decided.get(normalizeNonce(p.nonce));
          if (!outcome) remaining.push(p);
          else if (p.status === 'pending') {
            if (outcome === 'completed') settled += 1;
            else failed += 1;
          }
        }
        if (remaining.length !== pendingRef.current.length) {
          pendingRef.current = remaining;
          setPending(remaining);
          void savePending(publicKey, remaining);
        }
        addOutcomes({ settled, failed });
        // What the server still does not list after 14 days is marked unconfirmed now, with a fresh balance on screen.
        if (balance.status === 'fulfilled') expirePending();
        void saveSnapshot(publicKey, { balances: balancesRef.current, transactions: next, savedAt: now });
      } else {
        failure = failure ?? history.reason;
        setVoucherReviews([]);
        if (balance.status === 'fulfilled') {
          void saveWalletBalances(publicKey, {
            online: balance.value.balancePHP,
            offline: balance.value.offlineBalancePHP,
          });
        }
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
    [shortId, publicKey, walletSignal, addOutcomes, expirePending],
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
    setVoucherReviews([]);
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

  // Each sync submits this wallet's approved vouchers before reading History. Server rejections without a History
  // entry are marked failed on this phone.
  useEffect(() => {
    if (!publicKey || !walletSignal) return;
    return syncService.registerStep(
      'vouchers',
      async ({ signal }) => {
        if (walletSignal.aborted || !getConnectivity().online) return;
        const { givenUp } = await drainVouchers(publicKey, signal);
        if (walletSignal.aborted || givenUp.length === 0) return;
        const reasons = new Map(givenUp.map((g) => [normalizeNonce(g.nonce), g.reason]));
        let failed = 0;
        const next = pendingRef.current.map((p) => {
          const reason = reasons.get(normalizeNonce(p.nonce));
          if (reason === undefined || p.status !== 'pending') return p;
          failed += 1;
          return { ...p, status: 'failed' as const, failureReason: reason };
        });
        if (failed === 0) return;
        pendingRef.current = next;
        setPending(next);
        void savePending(publicKey, next);
        addOutcomes({ failed });
      },
      SYNC_ORDER_VOUCHERS,
    );
  }, [publicKey, walletSignal, addOutcomes]);

  // Settlement confirms queued by moves and transfers (e.g. the app was killed before they went out) are sent after
  // the vouchers and before the history read, so History already lists those transactions.
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
  // what Home shows until the network answers. Voucher reviews and approvals stay scoped to the wallet in the outbox.
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
    (payment: PendingOffline, voucher: string) => {
      if (!publicKey || !walletSignal || walletSignal.aborted) return false;
      const nonce = normalizeNonce(payment.nonce);
      if (serverRef.current.some((tx) => tx.nonce && normalizeNonce(tx.nonce) === nonce && tx.status !== 'pending')) {
        return true;
      }
      holdOffline(payment);
      try {
        rememberVoucherForReview(publicKey, voucher, payment.nonce, payment.timestamp, payment.feeCents, payment.assetCode);
      } catch (error) {
        reportError(error, { step: 'rememberVoucherForReview' });
        return false;
      }
      if (getConnectivity().online) syncService.requestSync({ afterCurrent: true });
      return true;
    },
    [publicKey, walletSignal, holdOffline],
  );

  const answerVoucherReview = useCallback(
    (review: VoucherReview, payment: PendingOffline | null) => {
      if (!publicKey || !walletSignal || walletSignal.aborted || review.row.publicKey !== publicKey) return false;
      try {
        if (payment) {
          if (!getConnectivity().online || !acceptVoucherReview(review)) return false;
          const unconfirmed = pendingRef.current.find(
            (p) => normalizeNonce(p.nonce) === review.row.dedupeKey && p.failureReason === EXPIRED_REASON,
          );
          if (unconfirmed) pendingRef.current = pendingRef.current.filter((p) => p !== unconfirmed);
          holdOffline(payment);
          syncService.requestSync({ afterCurrent: true });
        } else {
          dismissVoucherReview(review);
        }
        setVoucherReviews((reviews) => reviews.filter(({ row }) => row.id !== review.row.id));
        return true;
      } catch (error) {
        reportError(error, { step: 'answerVoucherReview' });
        return false;
      }
    },
    [publicKey, walletSignal, holdOffline],
  );

  const addMoves = useCallback(
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
    const listedRefs = new Set(serverTransactions.map((tx) => tx.ref));
    const localMoves = moves.filter((m) => !listedRefs.has(m.ref));
    if (waiting.length === 0 && localMoves.length === 0) return serverTransactions;
    return [...waiting, ...localMoves, ...serverTransactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [serverTransactions, pending, moves]);

  const pendingOffline = useMemo(
    () =>
      pending.reduce((sum, p) => {
        if (p.status !== 'pending' || p.direction !== 'out') return sum;
        return sum + Math.round(p.amount * 100) + savedOfflineFeeCents(p.feeCents, p.assetCode);
      }, 0) / 100,
    [pending],
  );
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
      voucherReviews: ownsData ? voucherReviews : [],
      answerVoucherReview,
      holdOffline,
      releaseOfflineHold,
      addMoves,
      pendingOffline: ownsData ? pendingOffline : 0,
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
      voucherReviews,
      answerVoucherReview,
      holdOffline,
      releaseOfflineHold,
      addMoves,
      pendingOffline,
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
