import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { DataTable, EmptyState, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { useTeach, useTeachData, Avatar, Loading, ErrorNote, shortDate, num } from '../lib.jsx';

export default function Certificates() {
  const { q } = useTeach();
  const { data, loading, error, reload } = useTeachData('/api/teach/certificates');
  const [text, setText] = useState('');
  const [sort, setSort] = useState({ key: 'completed', dir: -1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const rows = useMemo(() => { const s = text.trim().toLowerCase(); return sortRows((data || []).filter((c) => !s || `${c.number} ${c.student} ${c.email} ${c.course} ${c.code}`.toLowerCase().includes(s)), sort); }, [data, text, sort]);
  const month = new Date().toISOString().slice(0, 7);
  const cols = [
    { key: 'number', label: 'Certificate no.', sortable: true, render: (c) => <span className="code">{c.number}</span> },
    { key: 'student', label: 'Student', sortable: true, render: (c) => <span className="t-who"><Avatar name={c.student} size={30} /><span><b>{c.student}</b><span>{c.email}</span></span></span> },
    { key: 'course', label: 'Course', sortable: true, render: (c) => <span className="t-cell2"><b>{c.course}</b><span>{c.code}</span></span> },
    { key: 'completed', label: 'Completed', sortable: true, render: (c) => shortDate(c.completed) }
  ];
  return (
    <>
      <section className="t-head">
        <div><h1>Certificates</h1><p>Issued automatically when a learner completes one of your courses.</p></div>
        <button className="btn" disabled={!rows.length} onClick={() => downloadText(toCSV(rows, ['number', 'student', 'email', 'code', 'course', 'completed']), 'certificates.csv')}><Icon name="download" small />Export CSV</button>
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (<>
        <section className="t-mini">
          <div><span>Certificates issued</span><b className="num">{num(data.length)}</b></div>
          <div><span>This month</span><b className="num">{num(data.filter((c) => c.completed.startsWith(month)).length)}</b></div>
          <div><span>Learners certified</span><b className="num">{num(new Set(data.map((c) => c.email)).size)}</b></div>
          <div><span>Courses</span><b className="num">{num(new Set(data.map((c) => c.courseId)).size)}</b></div>
        </section>
        <section className="toolbar"><label className="field grow"><Icon name="search" small /><span className="sr">Search</span><input type="search" placeholder="Search certificate number, learner or course…" value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} /></label></section>
        <DataTable cols={cols} rows={rows} noun="certificates" sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
          actions={(c) => <a href={q(`/api/teach/certificates/${c.id}/pdf`)} download aria-label={`Download certificate for ${c.student}`} title="Download certificate (PDF)"><Icon name="download" small /></a>}
          empty={<EmptyState title={data.length ? 'No certificates match' : 'No certificates yet'} text={data.length ? 'Try a different search.' : 'They appear when learners complete your courses.'} />} />
      </>)}
    </>
  );
}
