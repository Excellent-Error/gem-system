import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then((me) => { if (active) setAdmin(me); })
      .catch(() => { if (active) setAdmin(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const me = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setAdmin(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* session already gone */ }
    setAdmin(null);
  }, []);

  return <AuthCtx.Provider value={{ admin, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
