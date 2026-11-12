import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Dialog, Field } from '../components/ui.jsx';
import OutlineDialog from '../components/OutlineDialog.jsx';
import { api } from '../api.js';
import { useToast } from '../lib/store.jsx';
import CoursePdfDialog from '../components/CoursePdfDialog.jsx';
import CatalogDialog from '../components/CatalogDialog.jsx';
import { useTeach, TABS, TAB_PILL, CourseThumb, Menu, num, ago } from './lib.jsx';

/** The parts a finished course has; a course missing any of them shows as "not complete". */
export const PARTS = [['description', 'Description'], ['topics', 'Topics'], ['objectives', 'Objectives'], ['lessons', 'Lessons'], ['outline', 'Outline']];
const missingOf = (c) => PARTS.filter(([k]) => !c.content?.[k]).map(([, l]) => l);
const pctOf = (c) => Math.round(((PARTS.length - missingOf(c).length) / PARTS.length) * 100);

function Completeness({ c }) {
  const miss = missingOf(c), pct = pctOf(c);
  return (
    <div className={`tc-comp ${pct === 100 ? 'ok' : pct >= 60 ? 'mid' : 'low'}`} title={miss.length ? `Missing: ${miss.join(', ')}` : 'Description, topics, objectives, lessons and outline are all in place'}>
      <div className="tc-comp-top"><b>{pct === 100 ? <><Icon name="check" small />Complete</> : 'Not complete'}</b><span className="num">{pct}%</span></div>
      <span className="tc-bar"><i style={{ width: pct + '%' }} /></span>
      {miss.length > 0 && <span className="tc-miss">Missing: {miss.join(', ')}</span>}
    </div>
  );
}

/**
 * An instructor's courses: status tabs, search, and per-course students and rating.
 * `full` (My Courses page) adds the big search bar, filters, content completeness and PDF downloads.
 * Client versions are listed under their main course (`nest`), behind a "N client versions" toggle.
 */
export default function CourseTable({ courses, limit, onChanged, full, nest = true, empty }) {
  const { q } = useTeach();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('');
  const [content, setContent] = useState(''); // '' | 'complete' | 'incomplete' | part key
  const [sort, setSort] = useState({ key: 'updated', dir: -1 });
  const [outlineFor, setOutlineFor] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [pdfFor, setPdfFor] = useState(null); // course ids for the PDF options window
  const [catalog, setCatalog] = useState(false);
  const [sel, setSel] = useState(() => new Set()); // picked courses, kept across tabs and searches
  const [page, setPage] = useState(1);
  const PER = 10;
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, k === 'all' ? courses.length : courses.filter((c) => c.tab === k).length])), [courses]);
  const platforms = useMemo(() => [...new Set(courses.map((c) => c.platform).filter(Boolean))].sort(), [courses]);
  const done = courses.filter((c) => pctOf(c) === 100).length;
  const rows = useMemo(() => {
    const s = text.trim().toLowerCase();
    const list = courses.filter((c) => (tab === 'all' || c.tab === tab) && (!s || `${c.name} ${c.code} ${c.product} ${c.platform}`.toLowerCase().includes(s))
      && (!platform || c.platform === platform)
      && (!content || (content === 'complete' ? pctOf(c) === 100 : content === 'incomplete' ? pctOf(c) < 100 : !c.content?.[content])));
    const val = (c) => (sort.key === 'rating' ? c.rating ?? -1 : sort.key === 'name' ? c.name.toLowerCase() : sort.key === 'complete' ? pctOf(c) : c[sort.key] ?? '');
    return list.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [courses, tab, text, platform, content, sort]);
  // client versions sit under their main course; one whose main course isn't listed stays on its own
  const [opened, setOpened] = useState(() => new Set());
  const flipOpen = (id) => setOpened((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const { tops, under } = useMemo(() => {
    const listed = new Set(rows.map((c) => c.id)), m = new Map();
    const child = (c) => nest && c.baseCourse && listed.has(c.baseCourse);
    for (const c of rows) if (child(c)) m.set(c.baseCourse, [...(m.get(c.baseCourse) || []), c]);
    return { tops: rows.filter((c) => !child(c)), under: m };
  }, [rows, nest]);
  const versions = useMemo(() => { const m = new Map(); for (const c of courses) if (c.baseCourse) m.set(c.baseCourse, (m.get(c.baseCourse) || 0) + 1); return m; }, [courses]);
  const isChild = (c) => nest && c.baseCourse && under.get(c.baseCourse)?.includes(c);
  const pages = full ? Math.max(1, Math.ceil(tops.length / PER)) : 1, cur = Math.min(page, pages);
  useEffect(() => { setPage(1); }, [tab, text, platform, content]);
  const shown = (limit ? tops.slice(0, limit) : full ? tops.slice((cur - 1) * PER, cur * PER) : tops)
    .flatMap((c) => [c, ...(under.has(c.id) && (opened.has(c.id) || text.trim()) ? under.get(c.id) : [])]);
  const filtered = text || platform || content || tab !== 'all';
  const th = (key, label, align) => (
    <th style={{ textAlign: align }} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === 'name' || key === 'complete' ? 1 : -1 }))}>{label}<Icon name={sort.key === key ? (sort.dir > 0 ? 'up' : 'down') : 'sort'} small /></button>
    </th>
  );
  const open = (c) => nav(q('/teach/courses/' + c.id));
  const download = (ids) => setPdfFor(ids);
  const picked = courses.filter((c) => sel.has(c.id));
  const allOn = shown.length > 0 && shown.every((c) => sel.has(c.id)), someOn = shown.some((c) => sel.has(c.id));
  const allRows = rows.length > 0 && rows.every((c) => sel.has(c.id));
  const toggle = (id) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); shown.forEach((c) => (allOn ? n.delete(c.id) : n.add(c.id))); return n; });
  const selectRows = () => setSel((s0) => new Set([...s0, ...rows.map((c) => c.id)]));
  return (
    <>
      {full ? (<>
        <label className="tc-search" htmlFor="tc-q"><Icon name="search" /><span className="sr">Search your courses</span>
          <input id="tc-q" type="search" placeholder="Search your courses by name, code, product or platform…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {text && <button type="button" className="linkbtn" onClick={() => setText('')}>Clear</button>}
        </label>
        <div className="tc-filters">
          <div className="t-tabs" role="tablist" aria-label="Course status">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span>({counts[k]})</span></button>)}
          </div>
          <span className="grow" />
          <select className="sel" aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All platforms</option>{platforms.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="sel" aria-label="Content" value={content} onChange={(e) => setContent(e.target.value)}>
            <option value="">All content</option><option value="complete">Complete</option><option value="incomplete">Not complete</option>
            <optgroup label="Missing…">{PARTS.map(([k, l]) => <option key={k} value={k}>Missing {l.toLowerCase()}</option>)}</optgroup>
          </select>
          {filtered && <button className="btn sm" onClick={() => { setText(''); setPlatform(''); setContent(''); setTab('all'); }}><Icon name="x" small />Clear filters</button>}
        </div>
        <div className="tc-summary">
          <button type="button" className={`tc-chip ok${content === 'complete' ? ' on' : ''}`} onClick={() => setContent(content === 'complete' ? '' : 'complete')}><Icon name="check" small />Complete <b className="num">{done}</b></button>
          <button type="button" className={`tc-chip warn${content === 'incomplete' ? ' on' : ''}`} onClick={() => setContent(content === 'incomplete' ? '' : 'incomplete')}><Icon name="alert" small />Not complete <b className="num">{courses.length - done}</b></button>
          <span className="note">{rows.length === courses.length ? `${courses.length} courses` : `${rows.length} of ${courses.length} courses match`}</span>
          <span className="grow" />
          <button className="btn sm" onClick={() => setCatalog(true)}><Icon name="book" small />Catalog</button>
          <button className="btn sm" onClick={() => download(rows.map((c) => c.id))} disabled={!rows.length}><Icon name="download" small />{rows.length === 1 ? 'Download PDF' : `Download all ${rows.length}`}</button>
        </div>
        {sel.size > 0 && (
          <section className="bulkbar" aria-label="Selected courses">
            <b><span className="num">{sel.size}</span> course{sel.size === 1 ? '' : 's'} selected</b>
            {!allRows && rows.length > shown.length && <button className="linkbtn" onClick={selectRows}>Select all {rows.length} matching</button>}
            <span className="grow" />
            <button className="btn sm primary" onClick={() => download(picked.map((c) => c.id))}><Icon name="download" small />{picked.length === 1 ? 'Download PDF' : `Download ${picked.length} PDFs (ZIP)`}</button>
            <button className="btn sm" onClick={() => setCatalog(true)}><Icon name="book" small />Catalog</button>
            <button className="btn sm" onClick={() => setSel(new Set())}><Icon name="x" small />Clear</button>
          </section>
        )}
      </>) : (
        <div className="t-tabsbar">
          <div className="t-tabs" role="tablist" aria-label="Course status">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span>({counts[k]})</span></button>)}
          </div>
          <label className="field t-tsearch"><Icon name="search" small /><span className="sr">Search courses</span><input type="search" placeholder="Search courses…" value={text} onChange={(e) => setText(e.target.value)} /></label>
        </div>
      )}
      {shown.length ? (
        <div className="tscroll">
          <table className="t-ctable">
            <thead><tr>{full && <th className="tc-pick"><input type="checkbox" className="pick" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={toggleAll} aria-label={allOn ? 'Unselect the courses on this page' : 'Select the courses on this page'} title={allOn ? 'Unselect this page' : 'Select this page'} /></th>}{full && <th className="tc-dlh"><span className="sr">Download</span></th>}{th('name', 'Course')}{full && th('complete', 'Content')}<th>Status</th>{th('students', 'Students', 'right')}{th('rating', 'Rating', 'right')}<th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{shown.map((c) => (
              <tr key={c.id} className={`click${sel.has(c.id) ? ' picked' : ''}${isChild(c) ? ' cv-child' : ''}`} onClick={(e) => { if (!e.target.closest('a,button,input')) open(c); }}>
                {full && <td className="tc-pick"><input type="checkbox" className="pick" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={'Select ' + c.name} /></td>}
                {full && <td className="tc-dlc"><button type="button" className="tc-dl" onClick={() => download([c.id])} title="Download PDF" aria-label={'Download PDF of ' + c.name}><Icon name="download" small /></button></td>}
                <td className="tc-name">{isChild(c) && <span className="cv-branch" aria-hidden="true">↳</span>}<div className="t-cname"><CourseThumb course={c} /><div>
                  <b>{c.name}{c.customFor && <span className="pill cv-pill" title={'Custom version for ' + c.customFor}>Custom · {c.customFor}</span>}{c.authoring && <span className="pill t-author" title="You own this course’s content">Author</span>}{c.authoring && c.teaching === false && <span className="pill" title="You author this course but don’t teach it">Not teaching</span>}</b>
                  <span>{c.code} · {c.lessons} lesson{c.lessons === 1 ? '' : 's'}{c.updated ? ` · Updated ${ago(c.updated)}` : ''}</span>
                  {nest && under.has(c.id) && <button type="button" className="cv-toggle" aria-expanded={opened.has(c.id) || !!text.trim()} disabled={!!text.trim()} onClick={() => flipOpen(c.id)}><Icon name="right" small className="chev" />{versions.get(c.id)} client version{versions.get(c.id) === 1 ? '' : 's'}</button>}
                </div></div></td>
                {full && <td><Completeness c={c} /></td>}
                <td><span className={`pill ${TAB_PILL[c.tab]}`}>{c.status || '—'}</span></td>
                <td className="num" style={{ textAlign: 'right' }}>{num(c.students)}</td>
                <td style={{ textAlign: 'right' }}>{c.rating != null ? <span className="t-rate"><span>★</span>{c.rating.toFixed(1)}</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td><Menu label={'Actions for ' + c.name} items={[
                  { icon: 'edit', label: 'Open course', onClick: () => open(c) },
                  c.teaching !== false && { icon: 'people', label: 'View students', onClick: () => nav(q('/teach/students', { course: c.id })) },
                  c.teaching !== false && c.tab !== 'archived' && { icon: 'send', label: 'Assign to learners', onClick: () => setAssignFor(c.id) },
                  { icon: 'upload', label: 'Upload outline', onClick: () => setOutlineFor(c.id) },
                  { icon: 'download', label: 'Download PDF', onClick: () => download([c.id]) }
                ]} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty"><Icon name="book" /><b>{courses.length ? 'No courses match' : empty?.[0] || 'No courses yet'}</b><span>{courses.length ? 'Try another search or filter.' : empty?.[1] || 'Create your first course to get started.'}</span></div>}
      {limit && tops.length > limit && <p className="note" style={{ margin: 0 }}>Showing {limit} of {tops.length} courses.</p>}
      {full && tops.length > PER && (
        <nav className="tc-pager" aria-label="Pages">
          <span className="note">Showing {(cur - 1) * PER + 1}–{Math.min(cur * PER, rows.length)} of {rows.length}</span>
          <span className="grow" />
          <button className="btn sm" onClick={() => setPage(cur - 1)} disabled={cur <= 1}><Icon name="left" small />Prev</button>
          {Array.from({ length: pages }, (_, k) => k + 1).filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 1).map((n, k, arr) => (
            <span key={n} style={{ display: 'contents' }}>{k > 0 && n - arr[k - 1] > 1 && <span className="note">…</span>}
              <button className={`btn sm tc-pg${n === cur ? ' on' : ''}`} aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button></span>
          ))}
          <button className="btn sm" onClick={() => setPage(cur + 1)} disabled={cur >= pages}>Next<Icon name="right" small /></button>
        </nav>
      )}
      {full && <CatalogDialog open={catalog} onClose={() => setCatalog(false)} defaultScope={picked.length ? 'selected' : filtered ? 'filtered' : 'all'} scopes={[
        ['all', 'All my courses', courses],
        filtered && ['filtered', 'Courses matching the current search and filters', rows],
        picked.length > 0 && ['selected', 'Selected courses', picked]
      ].filter(Boolean)} />}
      <OutlineDialog open={!!outlineFor} courseId={outlineFor} onClose={() => setOutlineFor(null)} onDone={onChanged} />
      <AssignDialog open={!!assignFor} courseId={assignFor} courses={courses} onClose={() => setAssignFor(null)} onDone={onChanged} />
      <CoursePdfDialog ids={pdfFor} onClose={() => setPdfFor(null)} />
    </>
  );
}

/** Assign one of your courses to learners by email, with an optional deadline. New emails get a learner profile. */
export function AssignDialog({ open, onClose, courses, courseId, onDone }) {
  const { q } = useTeach();
  const toast = useToast();
  const [f, setF] = useState({ courseId: '', emails: '', deadline: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const list = (courses || []).filter((c) => c.tab !== 'archived');
  useEffect(() => { if (open) { setF({ courseId: courseId || list[0]?.id || '', emails: '', deadline: '' }); setErr({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try {
      const r = await api.post(q('/api/teach/assign'), f);
      toast(`Assigned to ${r.assigned} learner${r.assigned === 1 ? '' : 's'}${r.updated ? `, ${r.updated} already enrolled (deadline updated)` : ''}`);
      onDone?.(); onClose();
    } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Assign course to learners" subtitle="They’ll see it on their dashboard as “Instructor Assigned”, with the deadline."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="tAssign" disabled={busy || !f.courseId}><Icon name="send" small />Assign course</button></>}>
      <form id="tAssign" className="form" noValidate onSubmit={submit}>
        <div className="fg full"><label htmlFor="as-course">Course</label>
          <select id="as-course" value={f.courseId} onChange={(e) => set('courseId')(e.target.value)} disabled={!!courseId}>{list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
        <Field id="as-emails" className="full" label="Learner emails" type="textarea" required value={f.emails} onChange={set('emails')} error={err.emails} placeholder={'one@company.com, two@company.com\nor one per line'} />
        <Field id="as-deadline" label="Deadline (optional)" type="date" value={f.deadline} onChange={set('deadline')} error={err.deadline} />
        <p className="note full" style={{ margin: 0 }}>Learners who don’t have an account yet will find the course waiting when they sign up with that email.</p>
      </form>
    </Dialog>
  );
}
