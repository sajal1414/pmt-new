import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Confirm, DataTable, Dialog, EmptyState, PageHead, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useAdminData, useTable, Loading, ErrorNote, Stats, Tag, Progress, AssignDialog, SearchBox, num, fmtDay } from '../lib.jsx';

const SOURCES = { purchase: 'Purchased', assigned: 'Assigned', batch: 'Batch', sample: 'Sample' };

export default function Enrollments() {
  const toast = useToast();
  const { data, error, reload, setData } = useAdminData('/api/admin/enrollments');
  const t = useTable({ key: 'enrolled', dir: -1 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [course, setCourse] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [del, setDel] = useState(null);
  const [edit, setEdit] = useState(null); // { row, deadline }

  const list = data || [];
  const courses = useMemo(() => [...new Map(list.map((e) => [e.courseId, `${e.code} · ${e.course}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [list]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortRows(list.filter((e) => (!s || [e.student, e.email, e.course, e.code].join(' ').toLowerCase().includes(s)) && (!status || e.status === status) && (!source || e.source === source) && (!course || e.courseId === course)), t.sort);
  }, [list, q, status, source, course, t.sort]);
  const count = (st) => list.filter((e) => e.status === st).length;

  const saveDeadline = async () => {
    try { const r = await api.put('/api/admin/enrollments/' + edit.row.id, { deadline: edit.deadline }); setData((d) => d.map((x) => (x.id === r.id ? r : x))); setEdit(null); toast('Deadline saved'); } catch (x) { toast(x.message); }
  };
  const cols = [
    { key: 'student', label: 'Learner', sortable: true, render: (e) => <span className="two"><b style={{ color: 'var(--ink)' }}>{e.student}</b><span>{e.email}</span></span> },
    { key: 'course', label: 'Course', sortable: true, tdStyle: { minWidth: 240 }, render: (e) => <span className="two"><Link className="rowlink" to={'/courses/' + e.courseId}>{e.course}</Link><span>{e.code}{e.instructor && ` · ${e.instructor}`}</span></span> },
    { key: 'source', label: 'Source', sortable: true, render: (e) => <span className="two"><span style={{ color: 'var(--ink)' }}>{SOURCES[e.source] || e.source}</span>{e.assignedBy && <span>by {e.assignedBy}</span>}{e.batch && <span>Batch {e.batch.startDate}{e.batch.endDate !== e.batch.startDate ? ` – ${e.batch.endDate}` : ''}</span>}{e.payment && <span>Payment {e.payment}</span>}</span> },
    { key: 'enrolled', label: 'Enrolled', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (e) => fmtDay(e.enrolled) },
    { key: 'progress', label: 'Progress', sortable: true, render: (e) => <Progress value={e.progress} /> },
    { key: 'deadline', label: 'Deadline', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (e) => (e.deadline ? fmtDay(e.deadline) : <span className="note">—</span>) },
    { key: 'status', label: 'Status', sortable: true, render: (e) => <Tag>{e.status}</Tag> }
  ];
  return (
    <>
      <PageHead eyebrow="Learning operations" title="Enrollments"
        actions={<>
          <button className="btn" onClick={() => downloadText(toCSV(rows, ['student', 'email', 'code', 'course', 'instructor', 'source', 'assignedBy', 'enrolled', 'progress', 'completed', 'deadline', 'status', 'amount', 'payment']), 'atlas-enrollments.csv')} disabled={!rows.length}><Icon name="download" small />Export CSV</button>
          <button className="btn primary" onClick={() => setAssigning(true)}><Icon name="plus" small />Enroll learners</button>
        </>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Total enrollments', num(list.length)], ['In progress', num(count('In progress')), 'acc'], ['Not started', num(count('Not started'))], ['Completed', num(count('Completed')), 'ok'], ['Overdue', num(count('Overdue')), count('Overdue') ? 'red' : '']]} />
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="en-q" value={q} onChange={(v) => { setQ(v); t.setPage(1); }} placeholder="Search learner, email or course…" />
          <select className="sel" aria-label="Course" value={course} onChange={(e) => { setCourse(e.target.value); t.setPage(1); }}><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select className="sel" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); t.setPage(1); }}><option value="">All statuses</option>{['Not started', 'In progress', 'Completed', 'Overdue'].map((s) => <option key={s}>{s}</option>)}</select>
          <select className="sel" aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); t.setPage(1); }}><option value="">All sources</option>{Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </section>
        <DataTable cols={cols} rows={rows} {...t.props} noun="enrollments"
          empty={<EmptyState title="No enrollments match" text="Try another filter, or enroll learners in a course." />}
          actions={(e) => <>
            <button onClick={() => setEdit({ row: e, deadline: e.deadline })} aria-label={'Set deadline for ' + e.student} title="Set deadline"><Icon name="cal" small /></button>
            <button onClick={() => setDel(e)} aria-label={'Remove ' + e.student + ' from ' + e.course} title="Remove enrollment"><Icon name="trash" small /></button>
          </>} />
      </>)}
      <AssignDialog open={assigning} onClose={() => setAssigning(false)} onDone={reload} />
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Set a deadline" subtitle={edit && `${edit.row.student} · ${edit.row.course}`}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button>{edit?.row.deadline && <button className="btn" onClick={() => setEdit((s) => ({ ...s, deadline: '' }))}>Clear deadline</button>}<button className="btn primary" onClick={saveDeadline}>Save</button></>}>
        {edit && <div className="fg"><label htmlFor="en-dl">Deadline</label><input id="en-dl" type="date" value={edit.deadline} onChange={(e) => setEdit((s) => ({ ...s, deadline: e.target.value }))} /></div>}
      </Dialog>
      <Confirm open={!!del} title="Remove this enrollment?" message={del && `${del.student} loses access to ${del.course}${del.progress ? ` and their ${del.progress}% progress` : ''}. Payments already recorded stay on the Payments page.`}
        confirmLabel="Remove enrollment" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del('/api/admin/enrollments/' + del.id); setData((d) => d.filter((x) => x.id !== del.id)); toast('Enrollment removed'); } catch (x) { toast(x.message); } setDel(null); }} />
    </>
  );
}
