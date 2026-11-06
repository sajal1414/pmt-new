import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../api.js';
import { Avatar, ago, ErrorNote } from '../teach/lib.jsx';
import { useLearn, firstName } from './lib.jsx';

const NAV = [
  ['/learn', 'home', 'Dashboard'], ['/learn/my-learning', 'cap', 'My Learning'], ['/learn/explore', 'search', 'Explore Courses'], ['/learn/certificates', 'award', 'My Certificates'],
  ['/learn/wishlist', 'heart', 'Wishlist'], ['/learn/messages', 'mail', 'Messages'], ['/learn/reviews', 'star', 'Reviews'], ['/learn/profile', 'gear', 'Profile & Settings']
];
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const applyTheme = (t) => (t === 'system' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', t));

function Search() {
  const { q } = useLearn();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState(null);
  const box = useRef(null);
  useEffect(() => { setPool(null); }, [q]);
  useEffect(() => { const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out); }, []);
  const load = () => { if (!pool) api.get(q('/api/learn/catalog')).then(setPool).catch(() => {}); };
  const s = text.trim().toLowerCase();
  const res = s && pool ? pool.courses.filter((c) => `${c.name} ${c.code} ${c.platform} ${c.product} ${c.instructor.name}`.toLowerCase().includes(s)).slice(0, 7) : null;
  const submit = (e) => { e.preventDefault(); setOpen(false); nav(q('/learn/explore', { q: text.trim() })); };
  return (
    <form className="t-search" ref={box} onSubmit={submit}>
      <label><Icon name="search" small /><span className="sr">Search courses, instructors, topics</span>
        <input type="search" placeholder="Search courses, instructors, topics…" value={text} onFocus={() => { load(); setOpen(true); }} onChange={(e) => { setText(e.target.value); setOpen(true); }} autoComplete="off" />
      </label>
      {open && res && (
        <div className="t-pop wide">
          {res.length ? <><h4>Courses</h4>{res.map((c) => <button type="button" key={c.id} onClick={() => { setText(''); setOpen(false); nav(q('/learn/courses/' + c.id)); }}><b>{c.name}</b><span>{c.instructor.name} · {c.platform} · {c.level}</span></button>)}<button type="submit" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>See all results →</button></>
            : <p className="note" style={{ margin: 10 }}>No courses match “{text}”.</p>}
        </div>
      )}
    </form>
  );
}

export default function LearnLayout() {
  const { user, logout } = useAuth();
  const { summary, reloadSummary, q, ready, error } = useLearn();
  const nav = useNavigate();
  const loc = useLocation();
  const [pop, setPop] = useState(null);
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
  const me = summary?.student;
  const withAs = (path) => { const [p, qs] = path.split('?'), u = q(p); return qs ? `${u}${u.includes('?') ? '&' : '?'}${qs}` : u; };
  const fresh = summary && !summary.enrolled;

  const pageName = loc.pathname.startsWith('/learn/contact') ? 'Get Details' : loc.pathname.startsWith('/learn/advisor') ? 'Hazdemy Course Advisor' : ([...NAV].sort((a, b) => b[0].length - a[0].length).find(([to]) => loc.pathname === to || (to !== '/learn' && loc.pathname.startsWith(to + '/'))) || NAV[0])[2];

  return (
    <div className={`tapp lapp${drawer ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
      <aside className="t-side" aria-label="Learner navigation">
        <Link to={q('/learn')} className="t-brand">
          <span className="logo logo-img" aria-hidden="true"><img src="/brand/hazdemy-icon.png" alt="" /></span>
          <span><img className="brand-img" src="/brand/hazdemy-logo-white.png" alt="Hazdemy Learning Services" /></span>
        </Link>
        <nav className="t-nav">
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={q(to)} end={to === '/learn'} className={({ isActive }) => (isActive || (to === '/learn/explore' && loc.pathname.startsWith('/learn/courses')) ? 'active' : '')}>
              <Icon name={icon} /><span>{label}</span>
              {to === '/learn/messages' && <em className={`t-badge${summary?.unread ? '' : ' zero'}`}>{summary?.unread || 0}</em>}
            </NavLink>
          ))}
        </nav>
        {fresh ? (
          <div className="l-sidecard help">
            <span className="l-sc-ic"><Icon name="help" /></span>
            <b>Need Help?</b><p>Our team is here to support your learning journey.</p>
            <a className="btn primary" href="mailto:support@hazdemy.com?subject=Hazdemy%20learner%20support">Contact Support</a>
          </div>
        ) : (
          <div className="l-sidecard">
            <svg viewBox="0 0 120 60" aria-hidden="true" className="l-peak"><path d="M10 55 45 18l14 15 12-10 39 32z" fill="#8E1B1E" /><path d="M45 18l8 9-8-3-7 5z" fill="#fff" /><path d="M45 18V4" stroke="#fff" strokeWidth="2" /><path d="M45 4h11l-3 4 3 4H45" fill="#FF7A45" /></svg>
            <p>Small steps every day lead to big results!</p>
            <span className="l-sc-bar"><i style={{ width: `${Math.max(6, Math.min(100, (summary?.streak ?? 0) * 14))}%` }} /></span>
          </div>
        )}
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
                      <Icon name={{ assigned: 'cap', deadline: 'cal', message: 'mail', review: 'star', request: 'send' }[n.kind] || 'bell'} small /><span>{n.text}<time>{ago(n.at)}</time></span>
                    </button>
                  )) : <p className="note" style={{ margin: 10 }}>You’re all caught up.</p>}
                </div>
              )}
            </div>
            <div className="t-pos">
              <button className="t-user" onClick={() => setPop(pop === 'user' ? null : 'user')} aria-expanded={pop === 'user'}>
                <Avatar name={me?.name || user.name || user.email} size={38} />
                <span className="who"><b>Hello, {firstName(me?.name || user.name) || 'there'}</b><span>Learner</span></span>
                <Icon name="down" small />
              </button>
              {pop === 'user' && (
                <div className="t-pop right menu">
                  <div style={{ padding: '6px 8px 8px' }}><b>{user.name || user.email}</b><div className="note">{user.email}</div></div><hr />
                  <button onClick={() => { setPop(null); nav(q('/learn/profile')); }}><Icon name="gear" small />Profile &amp; Settings</button>
                  {[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Match system']].map(([t, ic, l]) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}><Icon name={ic} small />{l}</button>)}
                  <hr /><button onClick={logout}><Icon name="out" small />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="t-content">
          {error && <ErrorNote error={error} />}
          {ready && !error ? <Outlet /> : !error && <p className="note">Choose a learner to view.</p>}
        </main>
      </div>
    </div>
  );
}
