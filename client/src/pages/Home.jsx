import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import AutoSchedule from '../components/AutoSchedule.jsx';
import { Confirm } from '../components/ui.jsx';
import { api } from '../api.js';
import { useAuth } from '../lib/auth.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { GROUPS, ago, groupOf, platformIcon, platformTone } from '../lib/constants.js';

/* ---------- date range ---------- */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS = [
  ['month', 'This month', 'this month', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)]; }],
  ['last', 'Last month', 'last month', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)]; }],
  ['30', 'Last 30 days', 'in 30 days', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29), n]; }],
  ['90', 'Last 90 days', 'in 90 days', () => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth(), n.getDate() - 89), n]; }],
  ['year', 'This year', 'this year', () => { const n = new Date(); return [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear(), 11, 31)]; }]
];
const nice = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const num = (n) => (n ?? 0).toLocaleString('en-US');

function RangePicker({ range, onChange }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from), [to, setTo] = useState(range.to);
  const box = useRef(null);
  useEffect(() => { setFrom(range.from); setTo(range.to); }, [range]);
  useEffect(() => {
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out);
  }, []);
  return (
    <div className="ad-range" ref={box}>
      <button type="button" className="ad-range-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Icon name="cal" small />{nice(range.from)} – {nice(range.to)}<Icon name="down" small /></button>
      {open && (
        <div className="ad-range-pop">
          {PRESETS.map(([id, label, word, fn]) => (
            <button key={id} type="button" aria-pressed={range.id === id} onClick={() => { const [a, b] = fn(); onChange({ id, word, from: iso(a), to: iso(b) }); setOpen(false); }}>{label}</button>
          ))}
          <div className="ad-range-custom">
            <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <button type="button" className="btn sm primary" disabled={!from || !to} onClick={() => { onChange({ id: 'custom', word: 'in this period', from: from <= to ? from : to, to: from <= to ? to : from }); setOpen(false); }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Course readiness per platform: one stacked bar per platform, split by lifecycle group (same colours as the status pills). */
function ReleaseCycle({ courses }) {
  const nav = useNavigate();
  const [hover, setHover] = useState(null); // `${platform}|${group}`
  const rows = useMemo(() => {
    const by = new Map();
    for (const c of courses) {
      const p = c.platform || 'Other', g = groupOf(c.status).id;
      if (!by.has(p)) by.set(p, { platform: p, total: 0, ...Object.fromEntries(GROUPS.map((x) => [x.id, 0])) });
      const r = by.get(p); r[g]++; r.total++;
    }
    return [...by.values()].sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform));
  }, [courses]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const go = (platform, group) => nav('/courses?' + new URLSearchParams({ platform, ...(group ? { status: 'grp:' + group } : {}) }));
  if (!rows.length) return <div className="empty"><b>No courses yet</b><span>Import your catalog to see readiness by platform.</span></div>;
  return (
    <div className="ad-rc">
      <div className="ad-rc-legend">{GROUPS.map((g) => <span key={g.id}><i style={{ background: g.mark }} />{g.short}</span>)}</div>
      <ul className="ad-rc-list">{rows.map((r) => (
        <li key={r.platform}>
          <button type="button" className="ad-rc-name" onClick={() => go(r.platform)} title={`Show all ${r.platform} courses`}>
            <span className={`cico ${platformTone(r.platform)}`}><Icon name={platformIcon(r.platform) || 'book'} small /></span><span>{r.platform}</span>
          </button>
          <span className="ad-rc-bar" style={{ width: `${(r.total / max) * 100}%` }} role="img"
            aria-label={`${r.platform}: ` + GROUPS.filter((g) => r[g.id]).map((g) => `${r[g.id]} ${g.short.toLowerCase()}`).join(', ')}>
            {GROUPS.filter((g) => r[g.id]).map((g) => (
              <button key={g.id} type="button" style={{ flexGrow: r[g.id], background: g.mark }} className={hover && hover !== `${r.platform}|${g.id}` ? 'dim' : ''}
                onMouseEnter={() => setHover(`${r.platform}|${g.id}`)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(`${r.platform}|${g.id}`)} onBlur={() => setHover(null)}
                onClick={() => go(r.platform, g.id)} title={`${r.platform} · ${g.short}: ${r[g.id]} course${r[g.id] === 1 ? '' : 's'}`} aria-label={`${r[g.id]} ${g.short} ${r.platform} courses`} />
            ))}
          </span>
          <b className="num ad-rc-n">{r.total}</b>
          <span className="ad-rc-sub">{GROUPS.filter((g) => r[g.id]).map((g) => `${r[g.id]} ${g.short.toLowerCase()}`).join(' · ')}</span>
        </li>
      ))}</ul>
    </div>
  );
}

/* ---------- pieces ---------- */
const KPI = [
  ['courses', 'book', 'Total Courses', 'ad-blue', '/courses'],
  ['available', 'check', 'Available Courses', 'ad-green', '/courses?status=grp:available'],
  ['pipeline', 'db', 'Pipeline', 'ad-sky', '/courses?status=grp:pipeline'],
  ['custom', 'layers', 'Custom Courses', 'ad-red', '/courses?custom=1'],
  ['instructors', 'user', 'Total Instructors', 'ad-violet', '/instructors'],
  ['users', 'people', 'Total Users', 'ad-indigo', '/users'],
  ['enrollments', 'cap', 'Active Enrollments', 'ad-orange', '/enrollments']
];
function Trend({ v, suffix = '%' }) {
  if (v == null || !isFinite(v)) return null;
  const up = v >= 0;
  return <span className={`ad-trend ${up ? 'up' : 'down'}`}><Icon name={up ? 'up' : 'down'} small />{up ? '+' : ''}{v}{suffix}</span>;
}
const ACT = { user: ['user', 'ad-blue'], enroll: ['people', 'ad-violet'], assign: ['people', 'ad-violet'], cert: ['award', 'ad-green'], review: ['star', 'ad-orange'], ok: ['check', 'ad-green'], remove: ['trash', 'ad-red'], add: ['plus', 'ad-blue'], update: ['edit', 'ad-blue'] };
const whenDay = (t) => { const days = Math.floor((Date.now() - t) / 864e5); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 30 ? `${days} days ago` : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

const QUICK = [
  ['book', 'Add New Course', 'Create a course in the catalog', '/courses/new', 'ad-blue'],
  ['user', 'Add Instructor', 'Add and manage instructors', '/instructors?new=1', 'ad-violet'],
  ['people', 'Manage Users', 'Accounts, roles and approvals', '/users', 'ad-green'],
  ['doc', 'Assign Courses', 'Assign courses to learners', '/assignments', 'ad-orange'],
  ['file', 'Import Outlines', 'Fill courses from Word files', '/courses?outlines=1', 'ad-red'],
  ['chart', 'View Reports', 'Detailed analytics and insights', '/reports', 'ad-sky'],
  ['cal', 'Auto-schedule Batches', 'Fill the next months with batches', 'auto-schedule', 'ad-green']
];

/* ---------- page ---------- */
export default function Home() {
  const [auto, setAuto] = useState(false); // the Auto-schedule window
  const { user } = useAuth();
  const { courses, reload: reloadAll } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [range, setRange] = useState(() => { const [, , word, fn] = PRESETS[0]; const [a, b] = fn(); return { id: 'month', word, from: iso(a), to: iso(b) }; });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('courses');
  const [busy, setBusy] = useState('');
  const [reject, setReject] = useState(null); // { kind, item }
  const load = useCallback(() => {
    api.get(`/api/admin/dashboard?from=${range.from}&to=${range.to}`).then((d) => { setData(d); setError(''); }, (e) => setError(e.message));
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const act = async (kind, item, action) => {
    setBusy(kind + item.id);
    try {
      await api.post(`/api/admin/approvals/${kind}/${item.id}/${action}`);
      toast(action === 'approve' ? `Approved ${item.name || item.course}` : kind === 'reviews' ? 'Review removed' : kind === 'courses' ? `${item.name} sent back to development` : `Sign-up from ${item.email} rejected`);
      load(); reloadAll(['courses', 'users', 'activity', 'ratings']);
    } catch (e) { toast(e.message); } finally { setBusy(''); setReject(null); }
  };

  const first = (user.name || 'Admin').split(' ')[0];
  const k = data?.kpis;
  const ap = data?.approvals;
  const tabs = ap ? [['courses', 'Courses', ap.courses.length], ['instructors', 'Instructors', ap.instructors.length], ['reviews', 'Reviews', ap.reviewsTotal]] : [];
  const sub = useMemo(() => k && {
    users: `+${num(k.users.added)} learners ${range.word}`,
    instructors: k.instructors.added ? `+${num(k.instructors.added)} ${range.word}` : `Across ${k.instructors.locations} locations`,
    courses: k.courses.added ? `+${num(k.courses.added)} ${range.word}` : `Across ${k.courses.platforms} platforms`,
    available: `${k.courses.value ? Math.round((k.available.value / k.courses.value) * 100) : 0}% of the catalog`,
    pipeline: `${num(k.pipeline.pipeline)} pipeline · ${num(k.pipeline.backlog)} backlog`,
    custom: k.custom.value ? `For ${num(k.custom.clients)} client${k.custom.clients === 1 ? '' : 's'}` : 'None yet',
    enrollments: `+${num(k.enrollments.added)} ${range.word}`,
    rating: `Based on ${num(k.rating.reviews)} reviews`
  }, [k, range.word]);

  return (
    <div className="ad">
      <section className="ad-hero">
        <div className="ad-hero-t">
          <h1>Welcome back, {first}!</h1>
          <p>Here’s an overview of your learning platform. Manage users, courses, instructors and track performance.</p>
        </div>
        <HeroArt />
        <RangePicker range={range} onChange={setRange} />
      </section>
      {error && <div className="card" role="alert"><b style={{ color: 'var(--red-ink)' }}>{error}</b><button className="btn sm" onClick={load}>Try again</button></div>}
      {!data ? !error && <p className="note" role="status">Loading the dashboard…</p> : (<>
        <section className="ad-kpis" aria-label="Key metrics">
          {KPI.map(([key, icon, label, tone, to]) => (
            <Link key={key} to={to} className={`ad-kpi ${tone}`}>
              <span className={`ad-ic ${tone}`}><Icon name={icon} /></span>
              <span className="ad-kpi-b">
                <span className="ad-kpi-l">{label}</span>
                <span className="ad-kpi-v"><b className="num">{num(k[key].value)}</b><Trend v={k[key].change} /></span>
                <span className="ad-kpi-s" title={sub[key]}>{sub[key]}</span>
              </span>
            </Link>
          ))}
        </section>

        <section className="ad-row-wide">
          <div className="card ad-card">
            <div className="ad-ch"><div><h2>Platform-Level Release Cycle</h2><p>Course readiness by platform · click a bar to filter</p></div><Link className="linkbtn" to="/courses">Release status →</Link></div>
            <ReleaseCycle courses={courses} />
          </div>
          <div className="card ad-card">
            <div className="ad-ch"><div><h2>Top Performing Courses</h2>{data.topCourses.some((c) => c.featured) && <p>{data.topCourses.some((c) => !c.featured) ? 'Ranked by enrollments, topped up with featured AI courses' : 'No enrollments yet · showing featured AI courses'}</p>}</div><Link className="linkbtn" to="/courses">View All →</Link></div>
            {data.topCourses.length ? <ol className="ad-top">{data.topCourses.map((c, i) => (
              <li key={c.id}><span className="ad-rank">{i + 1}</span><span className={`ad-thumb cico ${platformTone(c.platform)}`}><Icon name={platformIcon(c.platform) || 'book'} /></span>
                <Link to={'/courses/' + c.id} className="ad-top-b"><b>{c.name}</b><span>{c.featured ? <><span className={`ad-feat ${c.featured}`}>{c.featured === 'ai' ? 'AI course' : 'New'}</span>{c.code} · {c.status}</> : `${num(c.enrollments)} enrollments`}</span></Link>
                {c.rating != null ? <span className="ad-star"><span>★</span>{c.rating.toFixed(1)}</span> : <span className="note">—</span>}</li>
            ))}</ol> : <p className="note">No courses yet.</p>}
          </div>
        </section>

        <section className="ad-row3">
          <div className="card ad-card">
            <div className="ad-ch"><h2>Recent Activity</h2></div>
            {data.activity.length ? <ul className="ad-act">{data.activity.map((a, i) => { const [ic, tone] = ACT[a.kind] || ACT.update; return (
              <li key={i}><span className={`ad-dot ${tone}`}><Icon name={ic} small /></span><div><b>{a.title}</b><span>{a.text}</span></div><time>{a.day ? whenDay(a.at) : ago(a.at)}</time></li>
            ); })}</ul> : <p className="note">Nothing yet.</p>}
          </div>
          <div className="card ad-card">
            <div className="ad-ch"><h2>Pending Approvals</h2><Link className="linkbtn" to={tab === 'instructors' ? '/users' : tab === 'reviews' ? '/reviews' : '/courses?status=For%20Review'}>View All →</Link></div>
            <div className="ad-tabs" role="tablist">{tabs.map(([id, l, n]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l}<span className={n ? 'on' : ''}>{n}</span></button>)}</div>
            <ul className="ad-appr">
              {tab === 'courses' && ap.courses.map((c) => (
                <li key={c.id}><span className={`ad-thumb cico ${platformTone(c.platform)}`}><Icon name={platformIcon(c.platform) || 'book'} /></span>
                  <Link to={'/courses/' + c.id} className="ad-appr-b"><b>{c.name}</b><span>{[c.code, c.by && `By ${c.by}`].filter(Boolean).join(' · ')}</span>{c.date && <span>{nice(c.date)}</span>}</Link>
                  <Btns busy={busy === 'courses' + c.id} onOk={() => act('courses', c, 'approve')} onNo={() => setReject({ kind: 'courses', item: c })} /></li>
              ))}
              {tab === 'instructors' && ap.instructors.map((u) => (
                <li key={u.id}><span className="ad-thumb ad-violet"><Icon name="user" /></span>
                  <div className="ad-appr-b"><b>{u.name}</b><span>{u.email}</span>{u.by && <span>Profile: {u.by}</span>}</div>
                  <Btns busy={busy === 'instructors' + u.id} onOk={() => act('instructors', u, 'approve')} onNo={() => setReject({ kind: 'instructors', item: u })} /></li>
              ))}
              {tab === 'reviews' && ap.reviews.map((v) => (
                <li key={v.id}><span className="ad-thumb ad-orange"><Icon name="star" /></span>
                  <div className="ad-appr-b"><b><span className="ad-stars" aria-label={`${v.rating} out of 5`}>{'★'.repeat(v.rating)}<span className="ad-off">{'★'.repeat(5 - v.rating)}</span></span> {v.by}</b><span>{v.course}</span>{v.comment && <span className="ad-quote">“{v.comment}”</span>}</div>
                  <Btns busy={busy === 'reviews' + v.id} okLabel="Keep" noLabel="Remove" onOk={() => act('reviews', v, 'approve')} onNo={() => setReject({ kind: 'reviews', item: v })} /></li>
              ))}
              {!(tabs.find((t) => t[0] === tab)?.[2]) && <li className="ad-none"><Icon name="check" small />Nothing waiting for approval.</li>}
            </ul>
          </div>
          <div className="card ad-card">
            <div className="ad-ch"><h2>Upcoming Schedule</h2><span className="note">Next 60 days</span></div>
            {data.schedule.length ? <ul className="ad-sched">{data.schedule.map((s, i) => { const dt = new Date(s.date + 'T00:00:00'); return (
              <li key={i}><span className="ad-date"><small>{dt.toLocaleDateString('en-US', { month: 'short' })}</small><b>{dt.getDate()}</b></span>
                <div><b>{s.title}</b><span>{s.text}</span></div>
                {s.kind === 'deadline' ? <span className="ad-pill warn">Deadline</span> : <Link className="btn sm" to={'/courses/' + s.courseId}>View</Link>}</li>
            ); })}</ul> : <div className="empty"><Icon name="cal" /><b>Nothing scheduled</b><span>Batch start dates, learner deadlines and course release or retirement dates show here.</span></div>}
          </div>
        </section>

        <section className="card ad-card">
          <div className="ad-ch"><h2>Quick Actions</h2></div>
          <div className="ad-quick">{QUICK.map(([ic, t, s, to, tone]) => (
            <button key={t} type="button" className={`ad-q ${tone}`} onClick={() => (to === 'auto-schedule' ? setAuto(true) : nav(to))}><span className="ad-ic"><Icon name={ic} /></span><span><b>{t}</b><span>{s}</span></span></button>
          ))}</div>
        </section>
      </>)}
      <Confirm open={!!reject} busy={!!busy}
        title={reject?.kind === 'reviews' ? 'Remove this review?' : reject?.kind === 'courses' ? 'Send this course back?' : 'Reject this sign-up?'}
        message={reject?.kind === 'reviews' ? 'The review is deleted and no longer counts towards ratings.' : reject?.kind === 'courses' ? `${reject?.item.name} goes back to In Development and won’t be published.` : `The account for ${reject?.item.email} is deleted. They can sign up again.`}
        confirmLabel={reject?.kind === 'reviews' ? 'Remove review' : 'Reject'} onClose={() => setReject(null)} onConfirm={() => act(reject.kind, reject.item, 'reject')} />
      <AutoSchedule open={auto} onClose={() => setAuto(false)} />
    </div>
  );
}

function Btns({ busy, onOk, onNo, okLabel = 'Approve', noLabel = 'Reject' }) {
  return <span className="ad-btns"><button className="btn sm primary" disabled={busy} onClick={onOk}>{okLabel}</button><button className="btn sm ad-no" disabled={busy} onClick={onNo}>{noLabel}</button></span>;
}

/** Decorative illustration: graduation cap over a dashboard board, with a plant. */
function HeroArt() {
  return (
    <svg className="ad-art" viewBox="0 0 260 130" aria-hidden="true">
      <rect x="40" y="10" width="200" height="120" rx="24" fill="var(--ad-art-bg)" />
      <rect x="120" y="44" width="92" height="70" rx="10" fill="var(--surface)" stroke="var(--ad-art-line)" />
      <rect x="132" y="58" width="34" height="5" rx="2.5" fill="var(--ad-art-line)" /><rect x="132" y="70" width="24" height="5" rx="2.5" fill="var(--ad-art-line)" />
      <rect x="176" y="84" width="7" height="20" rx="2" fill="var(--s1)" opacity=".55" /><rect x="186" y="74" width="7" height="30" rx="2" fill="var(--s1)" opacity=".75" /><rect x="196" y="62" width="7" height="42" rx="2" fill="var(--s1)" />
      <path d="M134 98 l14 -10 10 6 14 -14" fill="none" stroke="var(--s3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M118 30 l42 -16 42 16 -42 16z" fill="#4E0405" /><path d="M134 36 v14 c0 6 52 6 52 0 v-14 l-26 10z" fill="#8E1B1E" />
      <path d="M202 30 v22" stroke="#E9A23B" strokeWidth="3" strokeLinecap="round" /><circle cx="202" cy="55" r="4" fill="#E9A23B" />
      <path d="M78 128 h30 l-4 -26 h-22z" fill="#2B0A0B" />
      <path d="M93 102 c-2 -22 -20 -30 -30 -32 c4 14 14 28 30 32z" fill="#14A36B" /><path d="M93 102 c2 -26 16 -40 30 -44 c-2 18 -12 36 -30 44z" fill="#14A36B" />
    </svg>
  );
}
