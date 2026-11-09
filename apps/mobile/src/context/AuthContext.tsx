import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { clearStoredAccount, saveStoredAccount } from '../services/accountStorage';
import { clearSession } from '../services/session';

/**
 * Who is signed in: the account the MPIN just unlocked, held in memory for the screens to read. The SEP-10
 * server session is separate (`services/session.ts`), made on demand by the actions that need it.
 */

export type UserMode = 'customer' | 'merchant';

/** What the screens show about the account. Comes from `/users/lookup` or `/register`. */
export type AccountProfile = {
  shortId: string;
  stellarPublicKey: string;
  firstName: string;
  lastName: string;
  /** E.164, e.g. +639123456789. */
  phone: string | null;
};

export type StoredAccount = AccountProfile & { role: string };

type AuthContextType = {
  activeAccount: StoredAccount | null;
  connectedWalletPublicKey: string | null;
  userMode: UserMode;
  isAppReady: boolean;
  login: (profile: AccountProfile) => Promise<void>;
  logout: () => Promise<void>;
  setUserMode: (mode: UserMode) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [activeAccount, setActiveAccount] = useState<StoredAccount | null>(null);
  const [userMode, setUserMode] = useState<UserMode>('customer');

  const login = useCallback(async (profile: AccountProfile) => {
    clearSession();
    setActiveAccount({ ...profile, role: 'USER' });
    setUserMode('customer');
    await saveStoredAccount(profile);
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    setActiveAccount(null);
    await clearStoredAccount();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      activeAccount,
      connectedWalletPublicKey: activeAccount?.stellarPublicKey ?? null,
      userMode,
      isAppReady: true,
      login,
      logout,
      setUserMode,
    }),
    [activeAccount, userMode, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/** The first name for the tab banners; falls back to a neutral word so the greeting never reads "Hello, !". */
export function greetingName(account: StoredAccount | null): string {
  return account?.firstName.trim() || 'there';
}

/** First and last name joined by a space. */
export function fullName(account: StoredAccount | null): string {
  return [account?.firstName, account?.lastName].filter(Boolean).join(' ').trim();
}
