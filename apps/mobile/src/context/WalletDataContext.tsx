import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { errorMessage, isAborted } from '../services/api/client';
import { getHistory, getVaultBalance } from '../services/api/wallet';
import { toTransactions } from '../services/transactionMapper';
import type { Transaction } from '../types/transaction';
import { useAuth } from './AuthContext';

/**
 * The signed-in account's balances and activity, read from the backend. One copy shared by Home, History,
 * the detail page and the amount checks on Send/Transfer, so they never disagree and do not refetch per screen.
 */
export type Balances = { online: number; offline: number };
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type WalletData = {
  /** `null` until the first successful read. */
  balances: Balances | null;
  transactions: Transaction[];
  status: LoadStatus;
  /** Why the last refresh failed. Earlier data stays on screen. */
  error: string | null;
  /** Skips the request when the data is fresh, unless `force` is set (pull-to-refresh). */
  refresh: (options?: { force?: boolean }) => Promise<void>;
};

const WalletDataContext = createContext<WalletData | undefined>(undefined);

const FRESH_MS = 15_000;
const HISTORY_LIMIT = 50;

export function WalletDataProvider({ children }: { children: React.ReactNode }) {
  const { activeAccount } = useAuth();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const loadedAt = useRef(0);

  const shortId = activeAccount?.shortId ?? null;
  const publicKey = activeAccount?.stellarPublicKey ?? null;

  const refresh = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!shortId || !publicKey) return;
      if (!force && Date.now() - loadedAt.current < FRESH_MS) return;

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
        setBalances({ online: balance.value.balancePHP, offline: balance.value.offlineBalancePHP });
      } else if (!isAborted(balance.reason)) failure = balance.reason;
      if (history.status === 'fulfilled') setTransactions(toTransactions(history.value));
      else if (!isAborted(history.reason)) failure = failure ?? history.reason;

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

  // A different (or no) account means nothing from the previous one may stay on screen.
  useEffect(() => {
    request.current?.abort();
    loadedAt.current = 0;
    setBalances(null);
    setTransactions([]);
    setError(null);
    setStatus('idle');
    if (shortId && publicKey) void refresh({ force: true });
    return () => request.current?.abort();
  }, [shortId, publicKey, refresh]);

  const value = useMemo<WalletData>(
    () => ({ balances, transactions, status, error, refresh }),
    [balances, transactions, status, error, refresh],
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
