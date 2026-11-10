import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useIsOnline } from '../hooks/useIsOnline';
import { errorMessage, isAborted } from '../services/api/client';
import { getHistory, getVaultBalance } from '../services/api/wallet';
import { toTransactions } from '../services/transactionMapper';
import {
  clearWalletCache,
  loadMoves,
  loadPending,
  loadSnapshot,
  normalizeNonce,
  saveMoves,
  savePending,
  saveSnapshot,
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
  /** Skips the request when the data is fresh, unless `force` is set (pull-to-refresh). */
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** Lists an offline payment sent from this phone right away, before the server has settled it. */
  addPendingOffline: (payment: PendingOffline) => void;
  /** Lists a move between the user's own wallets right away, until the server's history has it. */
  addMoves: (entries: Transaction[]) => void;
};

const WalletDataContext = createContext<WalletData | undefined>(undefined);

const FRESH_MS = 15_000;
const HISTORY_LIMIT = 50;
/** Enough for months of use, and small enough to keep the saved copy tiny. */
const MAX_MOVES = 100;
const OFFLINE_MESSAGE = "You're offline. Connect to the internet to load your transactions.";

export function WalletDataProvider({ children }: { children: React.ReactNode }) {
  const { activeAccount } = useAuth();
  const online = useIsOnline();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [serverTransactions, setServerTransactions] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<PendingOffline[]>([]);
  const [moves, setMoves] = useState<Transaction[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const loadedAt = useRef(0);
  // Latest values for code that runs after an await, where the render's copies may be stale.
  const balancesRef = useRef<Balances | null>(null);
  const serverRef = useRef<Transaction[]>([]);
  const pendingRef = useRef<PendingOffline[]>([]);
  const movesRef = useRef<Transaction[]>([]);
  const hasData = useRef(false);
  const onlineRef = useRef(online);
  const wasOnline = useRef(online);

  const shortId = activeAccount?.shortId ?? null;
  const publicKey = activeAccount?.stellarPublicKey ?? null;

  const refresh = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!shortId || !publicKey) return;
      if (!force && Date.now() - loadedAt.current < FRESH_MS) return;

      // No connection: do not start a request that can only fail. A saved copy stays on screen as it is; with
      // nothing saved, say why the list is empty.
      if (!onlineRef.current) {
        if (!hasData.current) {
          setError(OFFLINE_MESSAGE);
          setStatus('error');
        }
        return;
      }

      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setStatus('loading');

      const account = { shortId, stellarPublicKey: publicKey };
      const [balance, history] = await Promise.allSettled([
        getVaultBalance(account, controller.signal),
        getHistory(account, HISTORY_LIMIT, controller.signal),
      ]);
      if (controller.signal.aborted) return;

      // Each half succeeds or fails on its own, so a failed balance does not blank the history.
      let failure: unknown = null;
      if (balance.status === 'fulfilled') {
        const next = { online: balance.value.balancePHP, offline: balance.value.offlineBalancePHP };
        balancesRef.current = next;
        setBalances(next);
      } else if (!isAborted(balance.reason)) failure = balance.reason;

      if (history.status === 'fulfilled') {
        const next = toTransactions(history.value);
        serverRef.current = next;
        setServerTransactions(next);
        hasData.current = true;

        const now = Date.now();
        setSyncedAt(now);

        // Moves between the user's own wallets that the server now lists no longer need this phone's copy.
        const listedRefs = new Set(next.map((tx) => tx.ref));
        const stillLocal = movesRef.current.filter((m) => !listedRefs.has(m.ref));
        if (stillLocal.length !== movesRef.current.length) {
          movesRef.current = stillLocal;
          setMoves(stillLocal);
          void saveMoves(publicKey, stillLocal);
        }

        // Payments this phone sent that the server now lists no longer need a placeholder.
        const listed = new Set(next.flatMap((tx) => (tx.nonce ? [normalizeNonce(tx.nonce)] : [])));
        const remaining = pendingRef.current.filter((p) => !listed.has(normalizeNonce(p.nonce)));
        if (remaining.length !== pendingRef.current.length) {
          pendingRef.current = remaining;
          setPending(remaining);
          void savePending(publicKey, remaining);
        }
        void saveSnapshot(publicKey, { balances: balancesRef.current, transactions: next, savedAt: now });
      } else if (!isAborted(history.reason)) failure = failure ?? history.reason;

      if (failure) {
        setError(errorMessage(failure));
        setStatus('error');
      } else {
        loadedAt.current = Date.now();
        setError(null);
        setStatus('ready');
      }
    },
    [shortId, publicKey],
  );

  // A different (or no) account means nothing from the previous one may stay on screen. The saved copy for the new
  // account is shown first, so the screens have something while (or instead of) the network answers.
  useEffect(() => {
    let cancelled = false;
    request.current?.abort();
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

    if (shortId && publicKey) {
      void (async () => {
        const [snapshot, savedPending, savedMoves] = await Promise.all([
          loadSnapshot(publicKey),
          loadPending(publicKey),
          loadMoves(publicKey),
        ]);
        if (cancelled) return;
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
        await refresh({ force: true });
      })();
    }
    return () => {
      cancelled = true;
      request.current?.abort();
    };
  }, [shortId, publicKey, refresh]);

  // Coming back online reads fresh data without the user pulling to refresh.
  useEffect(() => {
    onlineRef.current = online;
    if (online && !wasOnline.current && shortId && publicKey) void refresh({ force: true });
    wasOnline.current = online;
  }, [online, shortId, publicKey, refresh]);

  // Signing out (or switching accounts) removes what this phone kept for the account that was there.
  const previousKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousKey.current && previousKey.current !== publicKey) void clearWalletCache(previousKey.current);
    previousKey.current = publicKey;
  }, [publicKey]);

  const addPendingOffline = useCallback(
    (payment: PendingOffline) => {
      if (!publicKey) return;
      const nonce = normalizeNonce(payment.nonce);
      if (pendingRef.current.some((p) => normalizeNonce(p.nonce) === nonce)) return;
      const next = [payment, ...pendingRef.current];
      pendingRef.current = next;
      hasData.current = true;
      setPending(next);
      void savePending(publicKey, next);
    },
    [publicKey],
  );

  const addMoves = useCallback(
    (entries: Transaction[]) => {
      if (!publicKey || entries.length === 0) return;
      const known = new Set(movesRef.current.map((m) => m.id));
      const fresh = entries.filter((e) => !known.has(e.id));
      if (fresh.length === 0) return;
      const next = [...fresh, ...movesRef.current].slice(0, MAX_MOVES);
      movesRef.current = next;
      hasData.current = true;
      setMoves(next);
      void saveMoves(publicKey, next);
    },
    [publicKey],
  );

  const transactions = useMemo(() => {
    const listed = new Set(serverTransactions.flatMap((tx) => (tx.nonce ? [normalizeNonce(tx.nonce)] : [])));
    const waiting = pending.filter((p) => !listed.has(normalizeNonce(p.nonce)));
    const listedRefs = new Set(serverTransactions.map((tx) => tx.ref));
    const localMoves = moves.filter((m) => !listedRefs.has(m.ref));
    if (waiting.length === 0 && localMoves.length === 0) return serverTransactions;
    return [...waiting, ...localMoves, ...serverTransactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [serverTransactions, pending, moves]);

  const value = useMemo<WalletData>(
    () => ({ balances, transactions, status, error, syncedAt, refresh, addPendingOffline, addMoves }),
    [balances, transactions, status, error, syncedAt, refresh, addPendingOffline, addMoves],
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
