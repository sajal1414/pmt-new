import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useAuth } from './auth.jsx';

const DataCtx = createContext(null);
const ToastCtx = createContext(() => {});

/** Loads every collection once and exposes reload helpers. Fine for a few thousand records. */
export function DataProvider({ children }) {
  const [state, setState] = useState({ courses: [], instructors: [], users: [], activity: [], ratings: { courses: {}, instructors: {} }, loading: true, error: '' });
  const isAdmin = useAuth().user?.role === 'Admin';
  const reload = useCallback(async (which = ['courses', 'instructors', 'users', 'activity', 'ratings']) => {
    if (!isAdmin) which = which.filter((w) => w !== 'users'); // only admins can list users
    try {
      const parts = await Promise.all(which.map((w) => api.get('/api/' + w)));
      setState((s) => ({ ...s, ...Object.fromEntries(which.map((w, i) => [w, parts[i]])), loading: false, error: '' }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [isAdmin]);
  useEffect(() => { reload(); }, [reload]);
  // coming back to the tab: fetch fresh data so pages never show (or save over) an old copy
  useEffect(() => {
    let last = Date.now();
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - last > 5000) { last = Date.now(); reload(); } };
    document.addEventListener('visibilitychange', back); window.addEventListener('focus', back);
    return () => { document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [reload]);
  const value = useMemo(() => ({ ...state, reload }), [state, reload]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
export const useData = () => useContext(DataCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div id="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast"><Icon name="check" small /><span>{t.msg}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
