import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useAuth } from '../lib/auth.jsx';
import { platformIcon, AREA_COLOR, platformTone } from '../lib/constants.js';

/* ---------- who we're looking at + the shared date range ---------- */
const TeachCtx = createContext(null);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const PRESETS = [
  ['7d', 'Last 7 days', () => { const t = iso(new Date()); return [addDays(t, -6), t]; }],
  ['30d', 'Last 30 days', () => { const t = iso(new Date()); return [addDays(t, -29), t]; }],
  ['90d', 'Last 90 days', () => { const t = iso(new Date()); return [addDays(t, -89), t]; }],
  ['month', 'This month', () => { const t = iso(new Date()); return [t.slice(0, 8) + '01', t]; }],
  ['last', 'Last month', () => { const n = new Date(); const s = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)), e = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)); return [iso(s), iso(e)]; }]
];

export function TeachProvider({ children }) {
  const { user } = useAuth();
  const admin = user.role === 'Admin';
  const [params, setParams] = useSearchParams();
  const [instructors, setInstructors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('30d');
  const [range, setRange] = useState(() => PRESETS[1][2]());
  // admins pick an instructor (kept in the URL so links and reloads keep it)
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const as = admin ? params.get('as') || read('atlas-teach-as') || '' : '';
  useEffect(() => { api.get('/api/teach/instructors').then(setInstructors).catch((e) => setError(e.message)); }, []);
  useEffect(() => { // default an admin to the instructor with the most courses
    if (admin && !as && instructors.length) setAs(instructors[0].id);
  }, [admin, as, instructors]); // eslint-disable-line react-hooks/exhaustive-deps
  const setAs = useCallback((id) => {
    try { localStorage.setItem('atlas-teach-as', id); } catch { /* storage blocked */ }
    setParams((p) => { const n = new URLSearchParams(p); n.set('as', id); return n; }, { replace: true });
  }, [setParams]);
  const q = useCallback((url, extra = {}) => {
    const p = new URLSearchParams(extra);
    if (admin && as) p.set('as', as);
    const s = p.toString();
    return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url;
  }, [admin, as]);
  const ready = !admin || !!as;
  const reloadSummary = useCallback(() => { if (ready) api.get(q('/api/teach/summary')).then((s) => { setSummary(s); setError(''); }).catch((e) => setError(e.message)); }, [q, ready]);
  useEffect(() => { reloadSummary(); }, [reloadSummary]);
  const pickPreset = (k) => { setPreset(k); const p = PRESETS.find((x) => x[0] === k); if (p) setRange(p[2]()); };
  const value = useMemo(() => ({ admin, as, setAs, instructors, summary, reloadSummary, q, ready, error, range, setRange, preset, setPreset, pickPreset }), [admin, as, setAs, instructors, summary, reloadSummary, q, ready, error, range, preset]); // eslint-disable-line react-hooks/exhaustive-deps
  return <TeachCtx.Provider value={value}>{children}</TeachCtx.Provider>;
}
export const useTeach = () => useContext(TeachCtx);

/** GET a /api/teach endpoint for the current instructor; re-fetches when the instructor or `deps` change. */
export function useTeachData(path, extra = {}, deps = []) {
  const { q, ready } = useTeach();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const key = q(path, extra);
  const load = useCallback(() => {
    if (!ready) return;
    setState((s) => ({ ...s, loading: true }));
    api.get(key).then((data) => setState({ data, loading: false, error: '' })).catch((e) => setState({ data: null, loading: false, error: e.message }));
  }, [key, ready]);
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

/* ---------- formatting ---------- */
export const money = (n, dp = 0) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const num = (n) => (Number(n) || 0).toLocaleString('en-US');
export const shortDate = (s) => (s ? new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export function ago(t) {
  if (!t) return '';
  const ms = typeof t === 'number' ? t : new Date(String(t).length === 10 ? t + 'T12:00:00' : t).getTime();
  const m = Math.round((Date.now() - ms) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  const w = Math.round(d / 7); if (w < 5) return `${w} week${w > 1 ? 's' : ''} ago`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo} month${mo > 1 ? 's' : ''} ago`;
  return `${Math.round(d / 365)} year${d >= 730 ? 's' : ''} ago`;
}
export const initials = (n) => String(n || '?').split(/\s+/).filter((w) => /[a-z]/i.test(w[0] || '')).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const TABS = [['all', 'All'], ['published', 'Published'], ['drafts', 'Drafts'], ['review', 'Under Review'], ['archived', 'Archived']];
export const TAB_PILL = { published: 'ok', drafts: 'gone', review: 'warn', archived: 'gone' };

/* ---------- small pieces ---------- */
export function Kpi({ icon, tone, label, value, change, note, sub }) {
  const up = change >= 0;
  return (
    <div className="t-kpi">
      <span className={`t-kic ${tone}`}><Icon name={icon} /></span>
      <div className="t-kb">
        <span className="t-kl">{label}</span>
        <b className="t-kv num">{value}</b>
        {change != null && <span className="t-kch"><span className={`t-kd ${up ? 'up' : 'down'}`}><Icon name={up ? 'trendup' : 'trenddown'} small />{up ? '+' : ''}{change}%</span>{note && <span className="t-kn">{note}</span>}</span>}
        {sub && <span className="t-kn">{sub}</span>}
      </div>
    </div>
  );
}

export function Stars({ value, size = 14 }) {
  const full = Math.round(value || 0);
  return <span className="t-stars" style={{ fontSize: size }} aria-label={`${value} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= full ? 'on' : ''}>★</span>)}</span>;
}

const THUMB = ['#8E1B1E', '#7C3AED', '#14A36B', '#E5484D', '#FF7A45', '#0E8A8A', '#4E0405', '#E9A23B'];
/** Course thumbnail in its course-area colour (Data, AI, Sustainability, Security, Automation, Infrastructure). */
export function CourseThumb({ course }) {
  const k = [...String(course.code || course.name || '')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % THUMB.length;
  return <span className="t-thumb" style={{ '--c': AREA_COLOR[platformTone(course.platform)] || THUMB[k] }} aria-hidden="true"><Icon name={platformIcon(course.platform) || 'book'} /></span>;
}

export const Avatar = ({ name, size = 36 }) => {
  const k = [...String(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % THUMB.length;
  return <span className="t-av" style={{ width: size, height: size, fontSize: size * 0.4, '--c': THUMB[k] }} aria-hidden="true">{initials(name)}</span>;
};

export function RangePicker() {
  const { range, setRange, preset, setPreset, pickPreset } = useTeach();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => { const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);
  const label = preset === 'custom' ? `${shortDate(range[0])} – ${shortDate(range[1])}` : `${shortDate(range[0])} – ${shortDate(range[1])}`;
  return (
    <div className="t-range" ref={box}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Icon name="cal" small />{label}<Icon name="down" small /></button>
      {open && (
        <div className="t-pop">
          {PRESETS.map(([k, l]) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => { pickPreset(k); setOpen(false); }}>{l}</button>)}
          <div className="t-custom">
            <span className="note">Custom range</span>
            <input type="date" value={range[0]} max={range[1]} onChange={(e) => { setPreset('custom'); setRange([e.target.value, range[1]]); }} aria-label="From" />
            <input type="date" value={range[1]} min={range[0]} onChange={(e) => { setPreset('custom'); setRange([range[0], e.target.value]); }} aria-label="To" />
          </div>
        </div>
      )}
    </div>
  );
}

export const Loading = ({ text = 'Loading…' }) => <div className="t-loading" role="status"><span className="spin dark" />{text}</div>;
export const ErrorNote = ({ error, retry }) => <div className="card" role="alert"><b style={{ color: 'var(--red-ink)' }}>{error}</b>{retry && <button className="btn sm" onClick={retry}>Try again</button>}</div>;

export function Menu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => { const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);
  return (
    <div className="t-menu" ref={box}>
      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-label={label} aria-expanded={open}><Icon name="dots" small /></button>
      {open && <div className="t-pop right">{items.filter(Boolean).map((it) => it.href
        ? <a key={it.label} href={it.href} download={it.download} onClick={() => setOpen(false)}><Icon name={it.icon} small />{it.label}</a>
        : <button key={it.label} onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}><Icon name={it.icon} small />{it.label}</button>)}</div>}
    </div>
  );
}
