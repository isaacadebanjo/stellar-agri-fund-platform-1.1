import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore, setOnUnauthorized } from './api.js';
import { WALLETS, rememberWalletProvider, clearWalletProvider } from './wallet.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Force logout when the api client sees a 401.
  useEffect(() => {
    setOnUnauthorized(() => setUser(null));
  }, []);

  // On mount: if there's a stored token, validate it via /auth/me.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) { setLoading(false); return; }
    api.auth.me()
      .then(async ({ user }) => {
        setUser(user);
        // Roll the token (revokes the old one) so an active session keeps a
        // fresh short-lived token instead of relying on one long-lived JWT.
        try {
          const { token: fresh } = await api.auth.refresh();
          if (fresh) tokenStore.set(fresh);
        } catch { /* keep the existing token if refresh fails */ }
      })
      .catch(() => {
        tokenStore.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    setError('');
    try {
      const { token, user } = await api.auth.login(email, password);
      tokenStore.set(token);
      setUser(user);
      return user;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  // Non-custodial login via a connected Stellar wallet (Freighter/Albedo).
  // SEP-10 handshake: connect → fetch challenge → sign in-wallet → verify.
  const loginWithWallet = useCallback(async (providerId) => {
    setError('');
    const wallet = WALLETS[providerId];
    if (!wallet) throw new Error('Unknown wallet provider');
    try {
      const publicKey = await wallet.getKey();
      const { transaction } = await api.auth.walletChallenge(publicKey);
      const signedXdr = await wallet.sign(transaction, publicKey);
      const { token, user: u } = await api.auth.walletVerify(signedXdr);
      tokenStore.set(token);
      rememberWalletProvider(providerId);
      setUser(u);
      return u;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  }, []);

  // --- Wallet-first onboarding (create account with a connected wallet) ------

  // Step 1: connect the wallet and sign a SEP-10 challenge (proof of ownership).
  // Does NOT log in — returns the signed proof so the UI can collect a name/email
  // before creating the account.
  const connectWalletForRegister = useCallback(async (providerId) => {
    const wallet = WALLETS[providerId];
    if (!wallet) throw new Error('Unknown wallet provider');
    const publicKey = await wallet.getKey();
    const { transaction } = await api.auth.walletChallenge(publicKey);
    const signedXdr = await wallet.sign(transaction, publicKey);
    return { transaction: signedXdr, publicKey, providerId };
  }, []);

  // Step 2: create (or fetch) the account. Stores the token so the follow-up
  // "Fund wallet" call is authenticated, but defers setUser until the user
  // finishes the onboarding screen (enterWalletSession).
  const registerWithWallet = useCallback(async ({ transaction, name, email }) => {
    const res = await api.auth.walletRegister({ transaction, name, email });
    tokenStore.set(res.token);
    return res; // { token, user, investor, wallet }
  }, []);

  // Optional: Friendbot-fund the freshly created wallet if it's still at 0.
  const fundMyWallet = useCallback(() => api.auth.walletFund(), []);

  // Step 3: finish onboarding — enter the app with the wallet session.
  const enterWalletSession = useCallback((u, providerId) => {
    if (providerId) rememberWalletProvider(providerId);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    tokenStore.clear();
    clearWalletProvider();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{
      user, loading, error, login, loginWithWallet, logout,
      connectWalletForRegister, registerWithWallet, fundMyWallet, enterWalletSession
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
