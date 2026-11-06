import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../api.js';
import { useTeach, Avatar, ago, ErrorNote } from './lib.jsx';

const NAV = [
  ['/teach', 'home', 'Dashboard'], ['/teach/courses', 'book', 'My Courses'], ['/teach/schedule', 'cal', 'Schedule'], ['/teach/students', 'people', 'Students'], ['/teach/analytics', 'chart', 'Analytics'],
  ['/teach/messages', 'msg', 'Messages'], ['/teach/reviews', 'star', 'Reviews'], ['/teach/certificates', 'award', 'Certificates'],
  ['/teach/resources', 'folder', 'Resources'], ['/teach/profile', 'gear', 'Profile & Settings']
];
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const applyTheme = (t) => (t === 'system' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', t));

function Search() {
  const { q } = useTeach();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState(null);
  const box = useRef(null);
  useEffect(() => { setPool(null); }, [q]);
  useEffect(() => { const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);
  const load = () => { if (!pool) Promise.all([api.get(q('/api/teach/courses')), api.get(q('/api/teach/students'))]).then(([courses, students]) => setPool({ courses, students })).catch(() => {}); };
  const s = text.trim().toLowerCase();
  const res = s && pool ? { courses: pool.courses.filter((c) => `${c.name} ${c.code} ${c.product}`.toLowerCase().includes(s)).slice(0, 5), students: pool.students.filter((x) => `${x.name} ${x.email}`.toLowerCase().includes(s)).slice(0, 5) } : null;
  const go = (path) => { setText(''); setOpen(false); nav(q(path)); };
  return (
    <div className="t-search" ref={box}>
      <label><Icon name="search" small /><span className="sr">Search courses and students</span>
        <input type="search" placeholder="Search courses or students…" value={text} onFocus={() => { load(); setOpen(true); }} onChange={(e) => { setText(e.target.value); setOpen(true); }} autoComplete="off" />
      </label>
      {open && res && (
        <div className="t-pop wide">
          {res.courses.length > 0 && <><h4>Courses</h4>{res.courses.map((c) => <button key={c.id} onClick={() => go('/teach/courses/' + c.id)}><b>{c.name}</b><span>{c.code} · {c.students} students</span></button>)}</>}
          {res.students.length > 0 && <><h4>Students</h4>{res.students.map((x) => <button key={x.id} onClick={() => go('/teach/students?student=' + x.id)}><b>{x.name}</b><span>{x.email}</span></button>)}</>}
          {!res.courses.length && !res.students.length && <p className="note" style={{ margin: 10 }}>No matches for “{text}”.</p>}
        </div>
      )}
    </div>
  );
}

export default function TeachLayout() {
  const { user, logout } = useAuth();
  const { summary, reloadSummary, q, ready, error } = useTeach();
  const nav = useNavigate();
  const loc = useLocation();
  const [pop, setPop] = useState(null); // 'bell' | 'user'
  const [drawer, setDrawer] = useState(false);
  // same sidebar behaviour as the admin area: collapse to icons on desktop, drawer on phones
  const [collapsed, setCollapsed] = useState(read('atlas-collapsed') === '1');
  useEffect(() => { write('atlas-collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  const toggleSide = () => { if (window.innerWidth <= 860) setDrawer((d) => !d); else setCollapsed((c) => !c); };
  const [theme, setTheme] = useState(read('atlas-theme') || 'system');
  const top = useRef(null);
  useEffect(() => { applyTheme(theme); write('atlas-theme', theme); }, [theme]);
  useEffect(() => { setDrawer(false); setPop(null); window.scrollTo(0, 0); reloadSummary(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const out = (e) => { if (top.current && !top.current.contains(e.target)) setPop(null); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);
  const inst = summary?.instructor;
  const link = (to) => q(to);
  // a path that may already have its own ?query, plus the admin's ?as=
  const withAs = (path) => { const [p, qs] = path.split('?'), u = q(p); return qs ? `${u}${u.includes('?') ? '&' : '?'}${qs}` : u; };

  const pageName = ([...NAV].sort((a, b) => b[0].length - a[0].length).find(([to]) => loc.pathname === to || (to !== '/teach' && loc.pathname.startsWith(to + '/'))) || NAV[0])[2];

  return (
    <div className={`tapp${drawer ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
      <aside className="t-side" aria-label="Instructor navigation">
        <Link to={link('/teach')} className="t-brand">
          <span className="logo logo-img" aria-hidden="true"><img src="/brand/hazdemy-icon.png" alt="" /></span>
          <span><img className="brand-img" src="/brand/hazdemy-logo-white.png" alt="Hazdemy Learning Services" /><small>Instructor</small></span>
        </Link>
        <nav className="t-nav">
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={link(to)} end={to === '/teach'} className={({ isActive }) => (isActive || (to !== '/teach' && loc.pathname.startsWith(to)) ? 'active' : '')}>
              <Icon name={icon} /><span>{label}</span>
              {to === '/teach/messages' && summary?.unread > 0 && <em className="t-badge">{summary.unread}</em>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="t-scrim" onClick={() => setDrawer(false)} />
      <div className="t-main">
        <header className="t-top" ref={top}>
          <button className="icon-btn tb-toggle" onClick={toggleSide} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg className="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
          <div className="tb-title"><h1 title={pageName}>{pageName}</h1></div>
          <Search />
          <div className="t-top-r">
            <div className="t-pos">
              <button className="icon-btn t-bell" onClick={() => setPop(pop === 'bell' ? null : 'bell')} aria-label="Notifications" aria-expanded={pop === 'bell'}>
                <Icon name="bell" />{summary?.notifications?.length > 0 && <span className="dot" />}
              </button>
              {pop === 'bell' && (
                <div className="t-pop right wide">
                  <h4>Notifications</h4>
                  {summary?.notifications?.length ? summary.notifications.map((n, i) => (
                    <button key={i} className="t-note" onClick={() => { setPop(null); nav(withAs(n.link)); }}>
                      <Icon name={n.kind === 'message' ? 'msg' : n.kind === 'review' ? 'star' : 'user'} small /><span>{n.text}<time>{ago(n.at)}</time></span>
                    </button>
                  )) : <p className="note" style={{ margin: 10 }}>You’re all caught up.</p>}
                </div>
              )}
            </div>
            <div className="t-pos">
              <button className="t-user" onClick={() => setPop(pop === 'user' ? null : 'user')} aria-expanded={pop === 'user'}>
                <Avatar name={inst?.name || user.name || user.email} size={38} />
                <span className="who"><b>{inst?.name || user.name}</b><span>Instructor</span></span>
                <Icon name="down" small />
              </button>
              {pop === 'user' && (
                <div className="t-pop right menu">
                  <div style={{ padding: '6px 8px 8px' }}><b>{user.name || user.email}</b><div className="note">{user.email}</div></div><hr />
                  <button onClick={() => { setPop(null); nav(link('/teach/profile')); }}><Icon name="gear" small />Profile &amp; Settings</button>
                  {[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Match system']].map(([t, ic, l]) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}><Icon name={ic} small />{l}</button>)}
                  <hr /><button onClick={logout}><Icon name="out" small />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="t-content">
          {error && <ErrorNote error={error} />}
          {ready && !error ? <Outlet /> : !error && <p className="note">Choose an instructor to view.</p>}
        </main>
      </div>
    </div>
  );
}
