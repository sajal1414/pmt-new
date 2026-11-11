import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { PageHead, downloadText, toCSV } from '../../components/ui.jsx';
import { BarChart } from '../../teach/charts.jsx';
import { useAdminData, Loading, ErrorNote, Stats, num, fmtMoney, fmtDay } from '../lib.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const RANGES = [
  ['12m', 'Last 12 months', () => [iso(new Date(Date.now() - 364 * 864e5)), iso(new Date())]],
  ['year', 'This year', () => [`${new Date().getFullYear()}-01-01`, iso(new Date())]],
  ['90', 'Last 90 days', () => [iso(new Date(Date.now() - 89 * 864e5)), iso(new Date())]],
  ['30', 'Last 30 days', () => [iso(new Date(Date.now() - 29 * 864e5)), iso(new Date())]]
];
const month = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short' });

function Table({ title, rows, cols, file, cur }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 10);
  const cell = (r, [k, , kind]) => (kind === 'money' ? fmtMoney(r[k], cur) : kind === 'pct' ? `${r[k]}%` : kind === 'rating' ? (r[k] != null ? `★ ${r[k].toFixed(1)}` : '—') : typeof r[k] === 'number' ? num(r[k]) : r[k]);
  return (
    <section className="card tablecard">
      <div className="am-th"><h2>{title}</h2><button className="btn sm" disabled={!rows.length} onClick={() => downloadText(toCSV(rows, cols.map((c) => c[0])), file)}><Icon name="download" small />CSV</button></div>
      {rows.length ? <div className="tscroll"><table>
        <thead><tr>{cols.map(([k, l, kind]) => <th key={k} style={kind ? { textAlign: 'right' } : undefined}>{l}</th>)}</tr></thead>
        <tbody>{shown.map((r, i) => <tr key={r.id || r.platform || i}>{cols.map((c) => <td key={c[0]} className={c[2] ? 'num' : undefined} style={c[2] ? { textAlign: 'right' } : undefined}>{c[3] ? c[3](r) : cell(r, c)}</td>)}</tr>)}</tbody>
      </table></div> : <p className="note" style={{ padding: 16, margin: 0 }}>No activity in this period.</p>}
      {rows.length > 10 && <div className="tfoot"><span>{all ? rows.length : 10} of {rows.length}</span><button className="btn sm" onClick={() => setAll((a) => !a)}>{all ? 'Show top 10' : 'Show all'}</button></div>}
    </section>
  );
}

export default function Reports() {
  const [rid, setRid] = useState('12m');
  const [custom, setCustom] = useState(null);
  const [from, to] = custom || RANGES.find((r) => r[0] === rid)[2]();
  const { data, error, reload } = useAdminData(`/api/admin/reports?from=${from}&to=${to}`);
  const cur = data?.currency || 'USD', T = data?.totals;
  const NUMS = [['enrollments', 'Enrollments', 'n'], ['completions', 'Completions', 'n'], ['completionRate', 'Completion', 'pct'], ['avgProgress', 'Avg progress', 'pct'], ['revenue', 'Revenue', 'money'], ['rating', 'Rating', 'rating']];
  return (
    <>
      <PageHead eyebrow="Insights" title="Reports & Analytics" summary={<span className="note">{fmtDay(from)} – {fmtDay(to)}</span>}
        actions={<>
          <div className="seg-row" role="group" aria-label="Period">{RANGES.map(([k, l]) => <button key={k} type="button" className="seg" aria-pressed={!custom && rid === k} onClick={() => { setCustom(null); setRid(k); }}>{l}</button>)}</div>
          <label className="am-date">From<input type="date" value={from} max={to} onChange={(e) => e.target.value && setCustom([e.target.value, to])} /></label>
          <label className="am-date">To<input type="date" value={to} min={from} onChange={(e) => e.target.value && setCustom([from, e.target.value])} /></label>
        </>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Enrollments', num(T.enrollments)], ['Active learners', num(T.learners), '', `${num(T.newLearners)} new sign-ups`], ['Completions', num(T.completions), 'ok', `${T.completionRate}% completion rate`], ['Average progress', `${T.avgProgress}%`], ['Revenue', fmtMoney(T.revenue, cur), 'acc', 'Paid and imported amounts'], ['Average rating', T.rating != null ? `★ ${T.rating.toFixed(1)}` : '—', '', `${num(T.ratings)} reviews`]]} />
        <section className="am-two">
          <div className="card"><h2 style={{ margin: 0, fontSize: 16 }}>Enrollments per month</h2><BarChart data={data.months.map((m) => ({ label: month(m.month), full: m.month, value: m.enrollments }))} label="Enrollments" /></div>
          <div className="card"><h2 style={{ margin: 0, fontSize: 16 }}>Completions per month</h2><BarChart data={data.months.map((m) => ({ label: month(m.month), full: m.month, value: m.completions }))} label="Completions" color="var(--s3)" /></div>
        </section>
        <section className="am-two">
          <div className="card"><h2 style={{ margin: 0, fontSize: 16 }}>Revenue per month ({cur})</h2><BarChart data={data.months.map((m) => ({ label: month(m.month), full: m.month, value: m.revenue }))} label="Revenue" color="var(--s2)" format={(v) => fmtMoney(v, cur).replace(/\.00$/, '')} /></div>
          <div className="card"><h2 style={{ margin: 0, fontSize: 16 }}>New learners per month</h2><BarChart data={data.months.map((m) => ({ label: month(m.month), full: m.month, value: m.learners }))} label="New learners" /></div>
        </section>
        <Table title="By platform" file="atlas-report-platforms.csv" cur={cur} rows={data.platforms} cols={[['platform', 'Platform'], ['courses', 'Courses', 'n'], ...NUMS.map(([k, l, kind]) => [k, l, kind])]} />
        <Table title="By instructor" file="atlas-report-instructors.csv" cur={cur} rows={data.instructors} cols={[['name', 'Instructor', '', (r) => <Link className="rowlink" to={'/instructors/' + r.id}>{r.name}</Link>], ['courses', 'Courses', 'n'], ['learners', 'Learners', 'n'], ...NUMS.map(([k, l, kind]) => [k, l, kind])]} />
        <Table title="By course" file="atlas-report-courses.csv" cur={cur} rows={data.courses} cols={[['name', 'Course', '', (r) => <span className="two"><Link className="rowlink" to={'/courses/' + r.id}>{r.name}</Link><span>{r.code}</span></span>], ...NUMS.map(([k, l, kind]) => [k, l, kind])]} />
      </>)}
    </>
  );
}
