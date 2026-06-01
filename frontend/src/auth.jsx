import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore, setOnUnauthorized } from './api.js';

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

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
