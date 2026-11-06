import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import BatchList, { STATUS_TONE, ZonePicker, useCompareZones } from './BatchList.jsx';
import { clock, dateRange, localZone, timesIn } from '../lib/timezones.js';
import { BatchDialog, EmailDialog, blankBatch } from './ScheduleEditor.jsx';
import InstructorAccounts from './InstructorAccounts.jsx';
import AutoSchedule from './AutoSchedule.jsx';
import { Confirm, Dialog, Field, PageHead, downloadText, toCSV } from './ui.jsx';
import { useToast } from '../lib/store.jsx';
import { api } from '../api.js';

const STATUSES = ['Open', 'Few seats left', 'Full', 'Cancelled'];
const MODES = ['Virtual', 'In person', 'Hybrid'];
const WHEN = [['upcoming', 'Upcoming'], ['now', 'Running now'], ['past', 'Finished'], ['all', 'All']];
const today = () => new Date().toISOString().slice(0, 10);
// the page's layout, kept in this browser: each course with its dates beside it, or every batch by month
const readView = () => { try { return localStorage.getItem('atlas-schedule-view') === 'date' ? 'date' : 'course'; } catch { return 'course'; } };
const monthOf = (d) => new Date(d.slice(0, 7) + '-15T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/**
 * Every batch across the courses: admins see all of them, instructors the courses they teach.
 * `courseUrl(id)` is where a course opens (on its Syllabus Preview tab); `teach` uses the instructor area's page header.
 */
export default function SchedulePage({ courseUrl, teach }) {
  const toast = useToast();
  const [data, setData] = useState(null); // { courses, batches }
  const list = data?.batches || null;
  const [error, setError] = useState('');
  const [when, setWhen] = useState('upcoming');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [mail, setMail] = useState(null); // the batch whose learners are being emailed
  const zones = useCompareZones(); // one zone picker for every month
  const load = () => api.get('/api/schedule').then(setData, (e) => setError(e.message));
  useEffect(() => { load(); }, []);
  // adding, changing and removing batches: saved straight to the course
  const [pick, setPick] = useState(null); // choosing the course for a new batch: { courseId }
  const [edit, setEdit] = useState(null); // { course, b }
  const [del, setDel] = useState(null); // a batch
  const [accounts, setAccounts] = useState(null); // learner sign-ins made for new emails
  const batchesOf = (id) => all.filter((x) => x.course.id === id).map(({ course, ...b }) => b);
  const saveBatches = async (course, schedules, done) => {
    try {
      const r = await api.put('/api/courses/' + course.id, { schedules });
      await load(); toast(done);
      if (r.accounts?.length) setAccounts(r.accounts);
      return true;
    } catch (e) { toast(e.fields?.schedules || e.message); return false; }
  };
  const put = async (b) => {
    const { isNew, ...clean } = b, now = batchesOf(edit.course.id);
    const next = isNew ? [...now, clean] : now.map((x) => (x.id === clean.id ? clean : x));
    if (await saveBatches(edit.course, next, `${isNew ? 'Batch added to' : 'Batch saved on'} ${edit.course.code}`)) setEdit(null);
  };
  // ticked batches, for deleting several at once (kept while filters change; cleared after a delete)
  const [sel, setSel] = useState(() => new Set());
  const [bulkDel, setBulkDel] = useState(false);
  const flipSel = (ids, on) => setSel((s0) => { const n = new Set(s0); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const removeSelected = async () => {
    try {
      const r = await api.post('/api/schedule/bulk-delete', { ids: [...sel] });
      setSel(new Set()); setBulkDel(false); await load();
      toast(`Deleted ${r.removed} batch${r.removed === 1 ? '' : 'es'}`);
    } catch (e) { toast(e.message); }
  };
  const remove = async () => {
    const c = del.course;
    await saveBatches(c, batchesOf(c.id).filter((x) => x.id !== del.id), `Batch removed from ${c.code}`);
    setDel(null);
  };
  const courses = useMemo(() => [...(data?.courses || [])].sort((a, b) => String(a.code).localeCompare(String(b.code))), [data]);
  const startNew = () => setPick({ courseId: '' });
  const [auto, setAuto] = useState(false);

  const now = today();
  const phase = (b) => (b.endDate < now ? 'past' : b.startDate <= now ? 'now' : 'upcoming');
  const all = list || [];
  const counts = useMemo(() => ({
    upcoming: all.filter((b) => phase(b) !== 'past').length, now: all.filter((b) => phase(b) === 'now').length,
    past: all.filter((b) => phase(b) === 'past').length, all: all.length
  }), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const teachers = useMemo(() => [...new Set(all.map((b) => b.instructor).filter(Boolean))].sort(), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((b) => (when === 'all' || (when === 'upcoming' ? phase(b) !== 'past' : phase(b) === when))
      && (!status || b.status === status) && (!mode || b.mode === mode) && (!instructor || b.instructor === instructor)
      && (!s || [b.course.name, b.course.code, b.course.customFor, b.instructor, b.location, b.days, ...(b.learners || [])].join(' ').toLowerCase().includes(s)))
      .sort((a, b) => (when === 'past' ? -1 : 1) * (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
  }, [list, when, q, status, mode, instructor]); // eslint-disable-line react-hooks/exhaustive-deps
  // grouped by the month each batch starts in
  const [view, setViewState] = useState(readView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem('atlas-schedule-view', v); } catch { /* storage blocked */ } };
  // by course: courses in the order of their first batch, each with its batches
  const byCourse = useMemo(() => { const m = new Map(); for (const b of rows) { if (!m.has(b.course.id)) m.set(b.course.id, { course: b.course, list: [] }); m.get(b.course.id).list.push(b); } return [...m.values()]; }, [rows]);
  const here = localZone();
  const months = useMemo(() => { const m = new Map(); for (const b of rows) { const k = b.startDate.slice(0, 7); m.set(k, [...(m.get(k) || []), b]); } return [...m]; }, [rows]);
  const booked = rows.reduce((a, b) => a + (b.learners?.length || 0), 0);
  const filtered = q || status || mode || instructor;
  const exportCsv = () => {
    downloadText(toCSV(rows.map((b) => ({ ...b, code: b.course.code, course: b.course.name, client: b.course.customFor, learners: (b.learners || []).join('; '), learnerCount: (b.learners || []).length })),
      ['code', 'course', 'client', 'startDate', 'endDate', 'startTime', 'endTime', 'timeZone', 'days', 'mode', 'location', 'instructor', 'seats', 'learnerCount', 'status', 'learners']), `hazdemy-schedule-${now}.csv`);
    toast(`Exported ${rows.length} batch${rows.length === 1 ? '' : 'es'}`);
  };

  // one batch on a line; `withCourse` adds the course (the instructor's list, by date)
  const batchRow = (b, withCourse) => {
    const own = timesIn(b, b.timeZone), mine = here !== b.timeZone ? timesIn(b, here) : null;
    const { course, ...rest } = b;
    return (
      <li key={b.id} className={`scc-b${withCourse ? ' with-course' : ''}${b.status === 'Cancelled' ? ' off' : ''}${phase(b) === 'now' ? ' now' : ''}${sel.has(b.id) ? ' picked' : ''}`}>
        <input type="checkbox" className="pick" checked={sel.has(b.id)} onChange={(e) => flipSel([b.id], e.target.checked)} aria-label={`Select the ${course.code} batch starting ${b.startDate}`} />
        <div className="scc-when">
          <b>{dateRange(b)}</b>
          <span>{clock(b.startTime)} – {clock(b.endTime)} <b className="abbr">{own.abbr}</b></span>
          {mine && <span className="note">{mine.times} {mine.abbr} · your time</span>}
        </div>
        {withCourse && (
          <div className="scc-cname">
            <Link to={courseUrl(course.id)} state={{ tab: 'syllabus' }}><span className="code">{course.code}</span><b>{course.name}</b></Link>
            {course.customFor && <span className="pill cv-pill">Custom · {course.customFor}</span>}
          </div>
        )}
        <div className="scc-meta">
          <span>{b.mode}{b.location ? ` · ${b.location}` : ''}</span>
          {b.instructor && <span><Icon name="user" small />{b.instructor}</span>}
        </div>
        <div className="scc-tags">
          {phase(b) === 'now' && <span className="pill ok">Running now</span>}
          <span className={`pill ${STATUS_TONE[b.status] || 'gone'}`}>{b.status}</span>
          <span className="note" title={(b.learners || []).join(', ')}>{(b.learners || []).length}{b.seats !== '' && b.seats != null ? ` / ${b.seats}` : ''} learner{(b.learners || []).length === 1 && (b.seats === '' || b.seats == null) ? '' : 's'}</span>
        </div>
        <div className="scc-act">
          <button type="button" onClick={() => setEdit({ course, b: rest })} title="Edit" aria-label="Edit batch"><Icon name="edit" small /></button>
          <button type="button" onClick={() => setEdit({ course, b: { ...rest, id: 'new-' + Date.now(), isNew: true, startDate: '', endDate: '', status: 'Open', learners: [] } })} title="Duplicate" aria-label="Duplicate batch"><Icon name="copy" small /></button>
          {b.learners?.length > 0 && <button type="button" onClick={() => setMail(b)} title="Email learners" aria-label="Email learners"><Icon name="send" small /></button>}
          <button type="button" className="del" onClick={() => setDel(b)} title="Delete" aria-label="Delete batch"><Icon name="trash" small /></button>
        </div>
      </li>
    );
  };
  const title = 'Schedule', sub = list ? `${counts.upcoming} upcoming batch${counts.upcoming === 1 ? '' : 'es'}${counts.now ? ` · ${counts.now} running now` : ''}` : 'The batches of every course, by date.';
  const exportBtn = <><button className="btn" onClick={exportCsv} disabled={!rows.length}><Icon name="download" small />Export CSV</button>
    {!teach && <button className="btn" onClick={() => setAuto(true)}><Icon name="cal" small />Auto-schedule</button>}
    <button className="btn primary" onClick={startNew} disabled={!courses.length}><Icon name="plus" small />New batch</button></>;
  return (
    <>
      {teach ? <section className="t-head"><div><h1>{title}</h1><p>{sub}</p></div><div className="sc-acts">{exportBtn}</div></section>
        : <PageHead eyebrow="Course batches" title={title} summary={<span className="pill acc">{sub}</span>} actions={exportBtn} />}
      {error && <div className="card" role="alert"><b style={{ color: 'var(--red-ink)' }}>{error}</b></div>}
      <section className="card sc-card">
        <div className="sc-bar">
          <div className="t-tabs" role="tablist" aria-label="When">
            {WHEN.map(([k, l]) => <button key={k} role="tab" aria-selected={when === k} onClick={() => setWhen(k)}>{l} <span>({counts[k]})</span></button>)}
          </div>
          <div className="sc-view" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'course'} onClick={() => setView('course')}><Icon name="book" small />By course</button>
            <button type="button" aria-pressed={view === 'date'} onClick={() => setView('date')}><Icon name="cal" small />By date</button>
          </div>
          <span className="grow" />
          <label className="field sc-q" htmlFor="sc-q"><Icon name="search" small /><span className="sr">Search</span>
            <input id="sc-q" type="search" placeholder="Course, instructor, learner email…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></label>
          {teachers.length > 1 && <select className="sel" aria-label="Instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)}><option value="">All instructors</option>{teachers.map((n) => <option key={n}>{n}</option>)}</select>}
          <select className="sel" aria-label="Delivery" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">All delivery</option>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
          <select className="sel" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((m) => <option key={m}>{m}</option>)}</select>
          {filtered && <button className="btn sm" onClick={() => { setQ(''); setStatus(''); setMode(''); setInstructor(''); }}><Icon name="x" small />Clear</button>}
        </div>
        {list && rows.length > 0 && view === 'date' && <ZonePicker zones={zones[0]} onChange={zones[1]} />}
        {list && <div className="sc-count">
          {rows.length > 0 && <input type="checkbox" className="pick" checked={rows.every((b) => sel.has(b.id))} ref={(el) => { if (el) el.indeterminate = rows.some((b) => sel.has(b.id)) && !rows.every((b) => sel.has(b.id)); }}
            onChange={(e) => flipSel(rows.map((b) => b.id), e.target.checked)} aria-label={`Select all ${rows.length} batches shown`} title={`Select all ${rows.length} shown`} />}
          <span className="note">{rows.length} batch{rows.length === 1 ? '' : 'es'}{booked ? ` · ${booked} learner${booked === 1 ? '' : 's'} booked` : ''}</span>
        </div>}
        {sel.size > 0 && (
          <section className="bulkbar" aria-label="Selected batches">
            <b><span className="num">{sel.size}</span> batch{sel.size === 1 ? '' : 'es'} selected</b>
            <span className="grow" />
            <button className="btn sm danger-o" onClick={() => setBulkDel(true)}><Icon name="trash" small />Delete</button>
            <button className="btn sm" onClick={() => setSel(new Set())}><Icon name="x" small />Clear</button>
          </section>
        )}
        {!list ? !error && <p className="note" role="status">Loading the schedule…</p>
          : !rows.length ? <div className="empty"><Icon name="cal" /><b>{all.length ? 'No batches match' : 'No batches scheduled yet'}</b>
            <span>{all.length ? 'Try another tab, search or filter.' : 'Open a course and add a batch on its Schedule tab.'}</span></div>
          : view === 'course' && instructor ? (
            <>
              <p className="note" style={{ margin: 0 }}>{instructor}’s batches, by date.</p>
              <ul className="scc scc-agenda">{rows.map((b) => batchRow(b, true))}</ul>
            </>
          ) : view === 'course' ? (
            <div className="scc">
              {byCourse.map(({ course, list: bs }) => (
                <div key={course.id} className="scc-row">
                  <div className="scc-course">
                    <label className="scc-all"><input type="checkbox" className="pick" checked={bs.every((b) => sel.has(b.id))} ref={(el) => { if (el) el.indeterminate = bs.some((b) => sel.has(b.id)) && !bs.every((b) => sel.has(b.id)); }}
                      onChange={(e) => flipSel(bs.map((b) => b.id), e.target.checked)} /><span>Select all {bs.length}</span></label>
                    <Link to={courseUrl(course.id)} state={{ tab: 'syllabus' }}><span className="code">{course.code}</span><b>{course.name}</b></Link>
                    {course.customFor && <span className="pill cv-pill">Custom · {course.customFor}</span>}
                    <span className="note">{bs.length} batch{bs.length === 1 ? '' : 'es'}{course.instructors?.length ? ` · ${course.instructors.join(', ')}` : ''}</span>
                    <button type="button" className="linkbtn" onClick={() => setEdit({ course, b: blankBatch(course, batchesOf(course.id)) })}><Icon name="plus" small />Add batch</button>
                  </div>
                  <ul className="scc-dates">{bs.map((b) => batchRow(b))}</ul>
                </div>
              ))}
            </div>
          ) : months.map(([k, bs]) => (
            <div key={k} className="sc-month">
              <h2>{monthOf(k)} <span className="note">· {bs.length} batch{bs.length === 1 ? '' : 'es'}</span></h2>
              <BatchList batches={bs} showNotes shared={zones}
                head={(b) => (<div className="sc-headrow">
                  <input type="checkbox" className="pick" checked={sel.has(b.id)} onChange={(e) => flipSel([b.id], e.target.checked)} aria-label={`Select the ${b.course.code} batch starting ${b.startDate}`} />
                  <Link className="sc-course" to={courseUrl(b.course.id)} state={{ tab: 'syllabus' }}>
                    <span className="code">{b.course.code}</span><b>{b.course.name}</b>
                    {b.course.customFor && <span className="pill cv-pill">Custom · {b.course.customFor}</span>}
                    {phase(b) === 'now' && <span className="pill ok">Running now</span>}
                  </Link>
                </div>)}
                actions={(b) => <>
                  <button className="btn sm" onClick={() => { const { course, ...rest } = b; setEdit({ course, b: rest }); }}><Icon name="edit" small />Edit</button>
                  <button className="btn sm" onClick={() => { const { course, ...rest } = b; setEdit({ course, b: { ...rest, id: 'new-' + Date.now(), isNew: true, startDate: '', endDate: '', status: 'Open', learners: [] } }); }}><Icon name="copy" small />Duplicate</button>
                  <Link className="btn sm" to={courseUrl(b.course.id)} state={{ tab: 'syllabus' }}><Icon name="book" small />Open course</Link>
                  {b.learners?.length > 0 && <button className="btn sm" onClick={() => setMail(b)}><Icon name="send" small />Email learners</button>}
                  <button className="btn sm ad-no" onClick={() => setDel(b)}><Icon name="trash" small />Delete</button>
                </>} />
            </div>
          ))}
        {rows.length > 0 && view === 'date' && <p className="note" style={{ margin: 0 }}>Times in other zones are for the first class day; daylight-saving changes during a long batch can move them by an hour.</p>}
      </section>
      <EmailDialog key={mail?.id || 'none-mail'} course={mail?.course || {}} batch={mail} onClose={() => setMail(null)} />
      {/* new batch: choose the course first */}
      <Dialog open={!!pick} onClose={() => setPick(null)} title="New batch" subtitle="Choose the course this batch is for."
        footer={<><button className="btn" onClick={() => setPick(null)}>Cancel</button>
          <button className="btn primary" disabled={!pick?.courseId} onClick={() => { const c = courses.find((x) => x.id === pick.courseId); setPick(null); setEdit({ course: c, b: blankBatch(c, batchesOf(c.id)) }); }}>Next<Icon name="right" small /></button></>}>
        {pick && <Field id="sc-course" label="Course" type="select" required value={pick.courseId} onChange={(v) => setPick({ courseId: v })}
          options={[{ value: '', label: 'Select a course…' }, ...courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}${c.customFor ? ` (${c.customFor})` : ''}` }))]} hideEmpty />}
      </Dialog>
      <BatchDialog key={edit?.b.id || 'none'} open={!!edit} initial={edit?.b} course={edit?.course || {}} onClose={() => setEdit(null)} onSave={put} />
      <Confirm open={bulkDel} title={`Delete ${sel.size} batch${sel.size === 1 ? '' : 'es'}?`} confirmLabel={`Delete ${sel.size} batch${sel.size === 1 ? '' : 'es'}`}
        message={(() => { const picked = all.filter((b) => sel.has(b.id)), withL = picked.filter((b) => b.learners?.length).length;
          return `They’re removed from their courses.${withL ? ` ${withL} of them ${withL === 1 ? 'has' : 'have'} learners: they stay enrolled in the course.` : ''}`; })()}
        onClose={() => setBulkDel(false)} onConfirm={removeSelected} />
      <Confirm open={!!del} title="Delete this batch?" message={del ? `The ${del.course.code} batch starting ${del.startDate} is removed from the course.` : ''} confirmLabel="Delete batch"
        onClose={() => setDel(null)} onConfirm={remove} />
      <InstructorAccounts who="learner" accounts={accounts} onClose={() => setAccounts(null)} />
      {!teach && <AutoSchedule open={auto} onClose={() => setAuto(false)} onDone={load} />}
    </>
  );
}
