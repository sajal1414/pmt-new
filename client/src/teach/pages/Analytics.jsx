import { useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { DataTable, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { useTeach, useTeachData, RangePicker, Stars, Loading, ErrorNote, money, num } from '../lib.jsx';
import { Engagement, HBars } from '../charts.jsx';
import { KpiRow, ENGAGEMENT } from './Dashboard.jsx';

export default function Analytics() {
  const { range } = useTeach();
  const { data, loading, error, reload } = useTeachData('/api/teach/analytics', { from: range[0], to: range[1] });
  const [sort, setSort] = useState({ key: 'periodEnrollments', dir: -1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const cols = [
    { key: 'name', label: 'Course', sortable: true, render: (c) => <span className="t-cell2"><b>{c.name}</b><span>{c.code} · {c.status}</span></span> },
    { key: 'periodViews', label: 'Views', sortable: true, tdStyle: { textAlign: 'right' }, render: (c) => num(c.periodViews) },
    { key: 'periodEnrollments', label: 'Enrollments', sortable: true, tdStyle: { textAlign: 'right' }, render: (c) => num(c.periodEnrollments) },
    { key: 'periodCompletions', label: 'Completions', sortable: true, tdStyle: { textAlign: 'right' }, render: (c) => num(c.periodCompletions) },
    { key: 'completionRate', label: 'Completion rate', sortable: true, tdStyle: { textAlign: 'right' }, render: (c) => `${c.completionRate}%` },
    { key: 'rating', label: 'Rating', sortable: true, tdStyle: { textAlign: 'right' }, render: (c) => (c.rating != null ? <span className="t-rate"><span>★</span>{c.rating.toFixed(1)} <span className="note">({c.ratings})</span></span> : '—') }
  ];
  const totalRatings = data ? data.ratings.reduce((a, r) => a + r.count, 0) : 0;
  return (
    <>
      <section className="t-head">
        <div><h1>Analytics</h1><p>How learners find, take and finish your courses.</p></div>
        <RangePicker />
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (<>
        <KpiRow k={data.kpis} />
        <section className="card"><Engagement data={data.series} series={ENGAGEMENT} /></section>
        <div className="t-two">
          <section className="card">
            <div className="chead"><h2>Ratings</h2>{data.avgRating != null && <span className="t-avg"><b>{data.avgRating.toFixed(1)}</b><Stars value={data.avgRating} /><span className="note">{num(totalRatings)} reviews</span></span>}</div>
            <HBars rows={data.ratings.map((r) => ({ label: `${r.star} star`, value: r.count }))} total={totalRatings} />
          </section>
          <section className="card">
            <div className="chead"><h2>Learner progress</h2><span className="note">All enrollments, all time</span></div>
            <HBars rows={data.funnel.map((f) => ({ label: f.label, value: f.count }))} total={data.funnel[0].count} />
          </section>
        </div>
        <section className="card tablecard t-flush">
          <div className="chead" style={{ padding: '14px 16px 0' }}><h2>By course <span className="note">· selected period</span></h2>
            <button className="btn sm" onClick={() => downloadText(toCSV(data.rows, ['code', 'name', 'status', 'periodViews', 'periodEnrollments', 'periodCompletions', 'completionRate', 'rating', 'ratings']), `course-analytics-${range[0]}-to-${range[1]}.csv`)}><Icon name="download" small />Export CSV</button></div>
          <DataTable cols={cols} rows={sortRows(data.rows, sort)} noun="courses" sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }} />
        </section>
      </>)}
    </>
  );
}
