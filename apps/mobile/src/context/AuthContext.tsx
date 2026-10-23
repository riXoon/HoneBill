import React, { createContext, useContext, useState } from 'react';

/**
 * Frontend-only auth: everything lives in memory, nothing touches the backend,
 * storage or Stellar. Same surface as the real provider so screens can use
 * `useAuth()` now and the real implementation can be restored later.
 */

export type UserMode = 'customer' | 'merchant';

export type StoredAccount = {
  shortId: string;
  role: string;
  stellarPublicKey: string;
};

type AuthContextType = {
  activeAccount: StoredAccount | null;
  connectedWalletPublicKey: string | null;
  jwt: string | null;
  userMode: UserMode;
  isAppReady: boolean;
  login: (publicKey: string, shortId: string, jwt?: string) => Promise<void>;
  logout: () => Promise<void>;
  setUserMode: (mode: UserMode) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [activeAccount, setActiveAccount] = useState<StoredAccount | null>(null);
  const [userMode, setUserMode] = useState<UserMode>('customer');

  const login = async (publicKey: string, shortId: string) => {
    setActiveAccount({ shortId, role: 'USER', stellarPublicKey: publicKey });
    setUserMode('customer');
  };

  const logout = async () => {
    setActiveAccount(null);
  };

  return (
    <AuthContext.Provider
      value={{
        activeAccount,
        connectedWalletPublicKey: activeAccount?.stellarPublicKey ?? null,
        jwt: null,
        userMode,
        isAppReady: true,
        login,
        logout,
        setUserMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
