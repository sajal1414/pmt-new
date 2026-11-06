import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useData } from '../lib/store.jsx';
import { api } from '../api.js';
import { ago, initials } from '../lib/constants.js';
import LearnerData from './LearnerData.jsx';
import { useAuth } from '../lib/auth.jsx';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
/** Admin pages: [path, icon, name] in sidebar order. */
const PAGES = [
  ['/', 'home', 'Dashboard'], ['/courses', 'book', 'Courses'], ['/schedule', 'cal', 'Schedule'], ['/requests', 'send', 'Requests'], ['/instructors', 'user', 'Instructors'], ['/users', 'people', 'Users'],
  ['/enrollments', 'cap', 'Enrollments'], ['/content', 'folder', 'Content Management'], ['/assignments', 'doc', 'Assignments'],
  ['/reviews', 'star', 'Reviews & Ratings'], ['/certificates', 'award', 'Certificates'], ['/reports', 'chart', 'Reports & Analytics'],
  ['/payments', 'dollar', 'Payments'], ['/notifications', 'bell', 'Notifications'], ['/website-api', 'globe', 'Website API'], ['/settings', 'gear', 'Site Settings'], ['/help', 'help', 'Help & Support']
];
function applyTheme(t) { if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }

export default function Layout() {
  const { courses, instructors, users, activity, reload, error } = useData();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(read('atlas-collapsed') === '1');
  const [open, setOpen] = useState(false); // phone drawer
  const [pop, setPop] = useState(null); // 'notif' | 'profile'
  const [theme, setTheme] = useState(read('atlas-theme') || 'system');
  const [q, setQ] = useState('');
  const [showRes, setShowRes] = useState(false);
  const [learners, setLearners] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => { applyTheme(theme); write('atlas-theme', theme); }, [theme]);
  useEffect(() => { write('atlas-collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  // browser tab title follows the platform name in Site Settings
  useEffect(() => {
    const set = () => api.get('/api/site').then((s) => { document.title = s.siteName || 'Hazdemy'; }, () => {});
    set(); window.addEventListener('atlas:site', set); return () => window.removeEventListener('atlas:site', set);
  }, []);
  useEffect(() => { setOpen(false); setPop(null); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') { setPop(null); setOpen(false); setShowRes(false); }
    };
    const click = (e) => { if (!e.target.closest('.tb-menu')) setPop(null); if (!e.target.closest('.gsearch')) setShowRes(false); };
    document.addEventListener('keydown', key); document.addEventListener('click', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('click', click); };
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return {
      pages: PAGES.filter(([, , l]) => l.toLowerCase().includes(s)).slice(0, 3),
      courses: courses.filter((c) => [c.code, c.ibmCode, c.name, c.product, ...(c.instructors || [])].join(' ').toLowerCase().includes(s)).slice(0, 5),
      instructors: instructors.filter((i) => [i.name, i.email, i.product, i.skills].join(' ').toLowerCase().includes(s)).slice(0, 3),
      users: users.filter((u) => [u.name, u.email].join(' ').toLowerCase().includes(s)).slice(0, 3)
    };
  }, [q, courses, instructors, users]);
  const found = results && Object.values(results).some((l) => l.length);
  const unread = activity.filter((a) => !a.read).length;
  const searchAll = () => { nav('/courses?q=' + encodeURIComponent(q.trim())); setQ(''); setShowRes(false); };
  const go = (to) => { setQ(''); setShowRes(false); nav(to); };
  // the page name in the top bar
  const title = useMemo(() => {
    const m = loc.pathname.match(/^\/courses\/([^/]+)/);
    if (loc.pathname === '/courses/import' || loc.pathname === '/instructors/import') return 'Bulk import';
    if (loc.pathname === '/courses/new') return 'New course';
    if (m) return courses.find((c) => c.id === m[1])?.name || 'Course';
    return PAGES.find(([to]) => to === loc.pathname)?.[2] || 'Not found';
  }, [loc.pathname, courses]);
  const crumb = loc.pathname.startsWith('/courses/') ? 'Courses' : loc.pathname.startsWith('/instructors/') ? 'Instructors' : '';
  const toggleSide = () => { if (window.innerWidth <= 860) setOpen((o) => !o); else setCollapsed((c) => !c); };
  // new learner requests, for the badge (checked again when the page changes or a request is answered)
  const [newRequests, setNewRequests] = useState(0);
  useEffect(() => {
    const check = () => api.get('/api/requests').then((l) => setNewRequests(l.filter((r) => r.status === 'New').length), () => {});
    check(); window.addEventListener('atlas:requests', check); return () => window.removeEventListener('atlas:requests', check);
  }, [loc.pathname]);
  const counts = { '/users': users.length, '/instructors': instructors.length, '/courses': courses.length, '/requests': newRequests || null };
  const item = (to, icon, label, count) => (
    <NavLink key={to} to={to} end={to === '/'} title={label}>
      <Icon name={icon} /><span className="t">{label}</span>{count != null && <span className="count">{count}</span>}
    </NavLink>
  );

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`} id="app">
      <aside className="side app-side" aria-label="Sidebar">
        <Link to="/" className="brand" aria-label="Hazdemy dashboard">
          <span className="logo logo-img" aria-hidden="true"><img src="/brand/hazdemy-icon.png" alt="" /></span>
          <span className="brand-t"><img className="brand-img" src="/brand/hazdemy-logo-white.png" alt="Hazdemy Learning Services" /></span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {PAGES.filter(([, , , side]) => side !== false).map(([to, icon, label]) => item(to, icon, label, counts[to]))}
        </nav>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="work">
        <header className="topbar">
          <button className="icon-btn tb-toggle" onClick={toggleSide} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg className="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
          <div className="tb-title">{crumb && <span className="tb-crumb">{crumb} /</span>}<h1 title={title}>{title}</h1></div>
          <div className="tb-right">
            <div className="gsearch tb-search">
              <label htmlFor="gq"><Icon name="search" small /><span className="sr">Search users, courses, instructors and pages</span>
                <input id="gq" ref={searchRef} type="search" placeholder="Search users, courses, instructors…" autoComplete="off" value={q}
                  onChange={(e) => { setQ(e.target.value); setShowRes(true); }} onFocus={() => setShowRes(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchAll(); } }} />
                <kbd>/</kbd>
              </label>
              {showRes && results && (
                <div className="gres">
                  {results.pages.length > 0 && <><h4>Pages</h4>{results.pages.map(([to, , l]) => <button key={to} onClick={() => go(to)}>{l}<span>Go to page</span></button>)}</>}
                  {results.courses.length > 0 && <><h4>Courses</h4>{results.courses.map((c) => <button key={c.id} onClick={() => go('/courses/' + c.id)}>{c.name}<span>{c.code} · {c.status}</span></button>)}</>}
                  {results.instructors.length > 0 && <><h4>Instructors</h4>{results.instructors.map((i) => <button key={i.id} onClick={() => go('/instructors?view=' + i.id)}>{i.name}<span>{[i.product, i.location].filter(Boolean).join(' · ')}</span></button>)}</>}
                  {results.users.length > 0 && <><h4>Users</h4>{results.users.map((u) => <button key={u.id} onClick={() => go('/users?q=' + encodeURIComponent(u.email))}>{u.name || u.email}<span>{u.email} · {u.role}</span></button>)}</>}
                  {!found ? <p>No matches for “{q}”.</p> : <button onClick={searchAll} style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>See all course results →</button>}
                </div>
              )}
            </div>
            <div className="tb-menu">
              <button className="icon-btn tb-bell" onClick={() => setPop(pop === 'notif' ? null : 'notif')} aria-expanded={pop === 'notif'} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
                <Icon name="bell" />{unread > 0 && <span className="tb-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {pop === 'notif' && (
                <div className="pop wide tb-pop">
                  <h4>Notifications <button className="linkbtn" onClick={async () => { await api.post('/api/activity/read'); reload(['activity']); }}>Mark all read</button></h4>
                  {activity.length ? activity.slice(0, 8).map((a, i) => (
                    <div key={i} className={`item${a.read ? '' : ' unread'}`}><Icon name={a.read ? 'check' : 'bell'} small /><div>{a.text}<time>{ago(a.t)}</time></div></div>
                  )) : <p className="note" style={{ margin: 8 }}>You’re all caught up.</p>}
                  <button className="linkbtn" style={{ margin: '4px 6px' }} onClick={() => { setPop(null); nav('/notifications'); }}>View all notifications →</button>
                </div>
              )}
            </div>
            <div className="tb-menu">
              <button className="tb-user" onClick={() => setPop(pop === 'profile' ? null : 'profile')} aria-expanded={pop === 'profile'} title="Account">
                <span className="avatar">{initials(user.name || user.email)}</span><span className="who"><b>{user.name || user.email}</b><span>{user.role === 'Admin' ? 'Administrator' : user.role}</span></span>
                <Icon name="down" small />
              </button>
              {pop === 'profile' && (
                <div className="pop menu tb-pop">
                  <div style={{ padding: '6px 8px 8px' }}><b>{user.name || user.email}</b><div className="note">{user.email}</div></div><hr />
                  {[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Match system']].map(([t, ic, l]) => (
                    <button key={t} aria-pressed={theme === t} onClick={() => { setTheme(t); setPop(null); }}><Icon name={ic} small />{l}</button>
                  ))}
                  {user.role === 'Admin' && <><hr /><button onClick={() => { setPop(null); setLearners(true); }}><Icon name="people" small />Learner data</button><button onClick={() => { setPop(null); nav('/settings'); }}><Icon name="gear" small />Site settings</button><button onClick={() => { setPop(null); nav('/help'); }}><Icon name="help" small />Help &amp; support</button></>}
                  <hr /><button onClick={() => { setPop(null); logout(); }}><Icon name="out" small />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="view">
          {error && <div className="card" role="alert" style={{ borderColor: 'var(--red-line)' }}><b style={{ color: 'var(--red-ink)' }}>{error}</b><span className="note">Start the API with <code>npm run dev</code> from the project folder, then reload this page.</span></div>}
          <Outlet />
        </main>
        <footer className="app-foot"><span>© 2026 Hazdemy. All rights reserved.</span><span>Hazdemy · Learning Services</span></footer>
      </div>
      <LearnerData open={learners} onClose={() => setLearners(false)} />
    </div>
  );
}
