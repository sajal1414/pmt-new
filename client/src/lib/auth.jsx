import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';

const AuthCtx = createContext(null);

/** Knows who is signed in. user: undefined while checking, null when signed out. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/api/me').then(setUser).catch((e) => { setUser(null); if (e.status !== 401) setError(e.message); });
    const out = () => setUser(null);
    window.addEventListener('atlas:signed-out', out);
    return () => window.removeEventListener('atlas:signed-out', out);
  }, []);
  const login = useCallback(async (email, password, remember = false) => { const u = await api.post('/api/login', { email, password, remember }); setError(''); setUser(u); return u; }, []);
  const logout = useCallback(async () => { await api.post('/api/logout').catch(() => {}); setUser(null); }, []);
  const changePassword = useCallback(async (current, password) => { const u = await api.post('/api/me/password', { current, password }); setUser(u); return u; }, []);
  const value = useMemo(() => ({ user, error, login, logout, changePassword }), [user, error, login, logout, changePassword]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/** Shows children only to a signed-in user who has set their own password; everyone else goes to /login. */
export function RequireAuth({ children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <div className="boot" aria-busy="true" />;
  if (!user || user.status === 'Password pending') return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}
