import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { DataTable, EmptyState, PageHead, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { useAdminData, useTable, Loading, ErrorNote, Stats, SearchBox, num, fmtDay } from '../lib.jsx';

export default function Certificates() {
  const { data, error, reload } = useAdminData('/api/admin/certificates');
  const t = useTable({ key: 'completed', dir: -1 });
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [period, setPeriod] = useState('');
  const all = data || [];
  const courses = useMemo(() => [...new Map(all.map((c) => [c.courseId, `${c.code} · ${c.course}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const since = (days) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortRows(all.filter((c) => (!s || [c.number, c.student, c.email, c.course, c.code].join(' ').toLowerCase().includes(s)) && (!course || c.courseId === course) && (!period || c.completed >= since(+period))), t.sort);
  }, [all, q, course, period, t.sort]);
  const cols = [
    { key: 'number', label: 'Certificate no.', sortable: true, render: (c) => <span className="code">{c.number}</span> },
    { key: 'student', label: 'Learner', sortable: true, render: (c) => <span className="two"><b style={{ color: 'var(--ink)' }}>{c.student}</b><span>{c.email}</span></span> },
    { key: 'course', label: 'Course', sortable: true, tdStyle: { minWidth: 240 }, render: (c) => <span className="two"><Link className="rowlink" to={'/courses/' + c.courseId}>{c.course}</Link><span>{c.code}</span></span> },
    { key: 'instructor', label: 'Instructor', sortable: true },
    { key: 'completed', label: 'Issued', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (c) => fmtDay(c.completed) }
  ];
  return (
    <>
      <PageHead eyebrow="Learning operations" title="Certificates"
        actions={<button className="btn" disabled={!rows.length} onClick={() => downloadText(toCSV(rows, ['number', 'student', 'email', 'code', 'course', 'instructor', 'completed']), 'atlas-certificates.csv')}><Icon name="download" small />Export CSV</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Certificates issued', num(all.length), 'ok'], ['Last 30 days', num(all.filter((c) => c.completed >= since(30)).length)], ['Learners certified', num(new Set(all.map((c) => c.email)).size)], ['Courses', num(courses.length)]]} />
        <p className="note" style={{ margin: 0 }}>A certificate is issued automatically when a learner completes every lesson of a course. Download any of them as a PDF.</p>
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="ce-q" value={q} onChange={(v) => { setQ(v); t.setPage(1); }} placeholder="Search number, learner or course…" />
          <select className="sel" aria-label="Course" value={course} onChange={(e) => { setCourse(e.target.value); t.setPage(1); }}><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select className="sel" aria-label="Issued" value={period} onChange={(e) => { setPeriod(e.target.value); t.setPage(1); }}><option value="">Any time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>
        </section>
        <DataTable cols={cols} rows={rows} {...t.props} noun="certificates" empty={<EmptyState title="No certificates match" text="Try another filter." />}
          actions={(c) => <a href={`/api/admin/certificates/${c.id}/pdf`} download title="Download PDF" aria-label={'Download certificate for ' + c.student}><Icon name="download" small /></a>} />
      </>)}
    </>
  );
}
