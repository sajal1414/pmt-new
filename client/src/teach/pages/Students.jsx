import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { DataTable, Dialog, EmptyState, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { useTeach, useTeachData, Avatar, Stars, Loading, ErrorNote, shortDate, ago, num } from '../lib.jsx';
import { AssignDialog } from '../CourseTable.jsx';

const Progress = ({ value }) => <span className="t-prog" title={`${value}% complete`}><span className="tr"><i style={{ width: `${value}%` }} /></span><b className="num">{value}%</b></span>;

export default function Students() {
  const { q } = useTeach();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useTeachData('/api/teach/students');
  const { data: courses } = useTeachData('/api/teach/courses');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'lastActive', dir: -1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [assigning, setAssigning] = useState(false);
  const course = params.get('course') || '';
  const openId = params.get('student');
  const setParam = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const rows = useMemo(() => {
    const s = text.trim().toLowerCase(), since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const list = (data || []).filter((x) => (!s || `${x.name} ${x.email} ${x.location}`.toLowerCase().includes(s))
      && (!course || x.enrollments.some((e) => e.courseId === course))
      && (status === 'all' || (status === 'completed' ? x.completed > 0 : status === 'progress' ? x.enrollments.some((e) => !e.completed) : x.lastActive >= since)));
    return sortRows(list, sort);
  }, [data, text, course, status, sort]);
  const stats = useMemo(() => {
    const all = data || [], since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return { total: all.length, active: all.filter((x) => x.lastActive >= since).length, completions: all.reduce((a, x) => a + x.completed, 0), progress: all.length ? Math.round(all.reduce((a, x) => a + x.progress, 0) / all.length) : 0 };
  }, [data]);
  const open = (data || []).find((x) => x.id === openId);
  const cols = [
    { key: 'name', label: 'Student', sortable: true, render: (x) => <span className="t-who"><Avatar name={x.name} size={32} /><span><b>{x.name}</b><span>{x.email}</span></span></span> },
    { key: 'location', label: 'Location', sortable: true },
    { key: 'courses', label: 'Courses', sortable: true, render: (x) => <span title={x.enrollments.map((e) => e.course).join('\n')}>{x.courses}{x.completed ? <span className="note"> · {x.completed} done</span> : ''}</span> },
    { key: 'progress', label: 'Avg. progress', sortable: true, render: (x) => <Progress value={x.progress} /> },
    { key: 'firstEnrolled', label: 'Enrolled', sortable: true, render: (x) => shortDate(x.firstEnrolled) },
    { key: 'lastActive', label: 'Last active', sortable: true, render: (x) => ago(x.lastActive) }
  ];
  const message = (x) => nav(q('/teach/messages', { to: x.id }));

  return (
    <>
      <section className="t-head">
        <div><h1>Students</h1><p>Everyone enrolled in your courses.</p></div>
        <div className="actions"><button className="btn primary" onClick={() => setAssigning(true)} disabled={!courses?.length}><Icon name="send" small />Assign course</button>
        <button className="btn" onClick={() => downloadText(toCSV(rows.map((x) => ({ ...x, courses: x.enrollments.map((e) => e.code).join(' ') })), ['name', 'email', 'location', 'courses', 'completed', 'progress', 'firstEnrolled', 'lastActive']), 'students.csv')} disabled={!rows.length}><Icon name="download" small />Export CSV</button></div>
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (<>
        <section className="t-mini">
          <div><span>Total students</span><b className="num">{num(stats.total)}</b></div>
          <div><span>Active in last 30 days</span><b className="num">{num(stats.active)}</b></div>
          <div><span>Course completions</span><b className="num">{num(stats.completions)}</b></div>
          <div><span>Average progress</span><b className="num">{stats.progress}%</b></div>
        </section>
        <section className="toolbar">
          <label className="field grow"><Icon name="search" small /><span className="sr">Search</span><input type="search" placeholder="Search name, email or location…" value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label>
          <select className="sel" value={course} onChange={(e) => { setParam('course', e.target.value); setPage(1); }} aria-label="Course"><option value="">All courses</option>{(courses || []).filter((c) => c.students).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
          <select className="sel" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status"><option value="all">All students</option><option value="active">Active (30 days)</option><option value="progress">In progress</option><option value="completed">Completed a course</option></select>
        </section>
        <DataTable cols={cols} rows={rows} noun="students" sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
          onRowClick={(x) => setParam('student', x.id)}
          actions={(x) => <button onClick={() => message(x)} aria-label={'Message ' + x.name} title="Message"><Icon name="msg" small /></button>}
          empty={<EmptyState title={data.length ? 'No students match' : 'No students yet'} text={data.length ? 'Try a different search or filter.' : 'Learners appear here once they enroll in your courses.'} />} />
      </>)}
      <AssignDialog open={assigning} courses={courses} courseId={course || ''} onClose={() => setAssigning(false)} onDone={reload} />
      <Dialog open={!!open} wide onClose={() => setParam('student', '')} title={open?.name} subtitle={open ? `${open.email}${open.location ? ' · ' + open.location : ''}` : ''}
        footer={<><button className="btn" onClick={() => setParam('student', '')}>Close</button><button className="btn primary" onClick={() => message(open)}><Icon name="msg" small />Send message</button></>}>
        {open && (<>
          <div className="t-mini in-dlg">
            <div><span>Courses</span><b>{open.courses}</b></div><div><span>Completed</span><b>{open.completed}</b></div><div><span>Avg. progress</span><b>{open.progress}%</b></div><div><span>Last active</span><b>{ago(open.lastActive)}</b></div>
          </div>
          <h3 className="t-h3">Enrollments</h3>
          <ul className="t-enr">{open.enrollments.map((e) => (
            <li key={e.id}><div><b>{e.course}</b><span className="note">{e.code} · enrolled {shortDate(e.enrolled)}{e.completed ? ` · completed ${shortDate(e.completed)}` : ''}</span></div><Progress value={e.progress} /></li>
          ))}</ul>
          {open.reviews.length > 0 && (<><h3 className="t-h3">Reviews</h3>
            <ul className="t-enr">{open.reviews.map((v) => <li key={v.id}><div><b>{v.course}</b><span className="note">{v.comment}</span></div><Stars value={v.rating} /></li>)}</ul></>)}
        </>)}
      </Dialog>
    </>
  );
}
