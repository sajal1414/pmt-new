import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import OutlineDialog from '../../components/OutlineDialog.jsx';
import { useTeach, useTeachData, RangePicker, Stars, Avatar, Loading, ErrorNote, num, ago } from '../lib.jsx';
import { Engagement } from '../charts.jsx';
import CourseTable from '../CourseTable.jsx';

export const ENGAGEMENT = [
  { key: 'views', label: 'Course Views', short: 'views', color: 'var(--s1)' },
  { key: 'enrollments', label: 'Enrollments', short: 'enrolled', color: 'var(--s2)' },
  { key: 'completions', label: 'Completions', short: 'completed', color: 'var(--s3)' }
];
const ACT = { enrollment: ['user', 't-ok'], review: ['msg', 't-acc'], completion: ['play', 't-vi'] };

const Trend = ({ v }) => (v == null || !isFinite(v) ? null
  : <span className={`ad-trend ${v >= 0 ? 'up' : 'down'}`}><Icon name={v >= 0 ? 'up' : 'down'} small />{v >= 0 ? '+' : ''}{v}%</span>);

/** Key figures in the admin dashboard's card style; with `courses` it leads with published and draft counts. */
export function KpiRow({ k, courses }) {
  const tab = (t) => (courses || []).filter((c) => c.tab === t).length;
  const custom = (courses || []).filter((c) => c.customFor), clients = new Set(custom.map((c) => c.customFor.trim().toLowerCase())).size;
  const vs = 'vs previous period';
  const cards = [
    ...(courses ? [
      ['check', 'ad-green', 'Published Courses', num(tab('published')), null, `of ${num(courses.length)} courses`],
      ['edit', 'ad-orange', 'Draft Courses', num(tab('drafts')), null, [tab('review') && `${tab('review')} under review`, tab('archived') && `${tab('archived')} archived`].filter(Boolean).join(' · ') || 'in progress'],
      ['layers', 'ad-red', 'Custom Courses', num(custom.length), null, custom.length ? `for ${num(clients)} client${clients === 1 ? '' : 's'}` : 'none yet']
    ] : []),
    ['people', 'ad-blue', 'Total Students', num(k.students.value), k.students.change, vs],
    ['play', 'ad-violet', 'Total Enrollments', num(k.enrollments.value), k.enrollments.change, vs],
    ['chart', 'ad-sky', 'Course Views', num(k.views.value), k.views.change, vs]
  ];
  return (
    <section className={`ad-kpis t-kpirow n${cards.length}`} aria-label="Key figures">
      {cards.map(([icon, tone, label, value, change, sub]) => (
        <div key={label} className={`ad-kpi ${tone}`}>
          <span className={`ad-ic ${tone}`}><Icon name={icon} /></span>
          <span className="ad-kpi-b">
            <span className="ad-kpi-l">{label}</span>
            <span className="ad-kpi-v"><b className="num">{value}</b><Trend v={change} /></span>
            <span className="ad-kpi-s" title={sub}>{sub}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

export default function Dashboard() {
  const { q, range, summary } = useTeach();
  const nav = useNavigate();
  const { data, loading, error, reload } = useTeachData('/api/teach/overview', { from: range[0], to: range[1] });
  const [uploading, setUploading] = useState(false);
  const mine = useMemo(() => new Set((data?.courses || []).map((c) => c.id)), [data]);
  const first = (summary?.instructor?.name || '').replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(' ')[0];

  return (
    <>
      <section className="t-head">
        <div><h1>Instructor Dashboard</h1><p>Welcome back{first ? `, ${first}` : ''}! Here’s what’s happening with your courses.</p></div>
        <RangePicker />
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? (loading && <Loading />) : (<>
        <KpiRow k={data.kpis} courses={data.courses} />
        <div className="t-grid">
          <div className="t-col">
            <section className="card">
              <div className="chead"><h2>My Courses</h2><Link className="linkbtn" to={q('/teach/courses')}>View All</Link></div>
              <CourseTable courses={data.courses} limit={5} onChanged={reload} />
            </section>
            <section className="card">
              <div className="chead"><h2>Custom Courses</h2><Link className="linkbtn" to={q('/teach/courses')}>View All</Link></div>
              <p className="note" style={{ margin: '-4px 0 0' }}>Versions of your courses made for one client.</p>
              <CourseTable courses={data.courses.filter((c) => c.customFor)} limit={5} nest={false} onChanged={reload}
                empty={['No custom courses yet', 'Open a course and choose Custom version to make one for a client.']} />
            </section>
            <section className="card"><Engagement data={data.series} series={ENGAGEMENT} /></section>
          </div>
          <aside className="t-col t-aside">
            <section className="card">
              <h2>Quick Actions</h2>
              <div className="t-qa">
                {[['plus', 'ad-blue', 'Create New Course', 'Start a course from scratch', () => nav(q('/teach/courses/new'))],
                  ['book', 'ad-violet', 'Manage Courses', 'Edit your courses and lessons', () => nav(q('/teach/courses'))],
                  ['upload', 'ad-orange', 'Upload Content', 'Add files, videos and slides', () => setUploading(true)],
                  ['people', 'ad-green', 'View Students', 'Progress of your learners', () => nav(q('/teach/students'))],
                  ['chart', 'ad-sky', 'Analytics', 'Views, enrollments and trends', () => nav(q('/teach/analytics'))]
                ].map(([ic, tone, t, s, go]) => (
                  <button key={t} type="button" className={`ad-q ${tone}`} onClick={go}><span className="ad-ic"><Icon name={ic} /></span><span><b>{t}</b><span>{s}</span></span></button>
                ))}
              </div>
            </section>
            <section className="card">
              <div className="chead"><h2>Latest Reviews</h2><Link className="linkbtn" to={q('/teach/reviews')}>View All</Link></div>
              {data.reviews.length ? <ul className="t-list">{data.reviews.map((v) => (
                <li key={v.id} className="t-review">
                  <Avatar name={v.student} />
                  <div><div className="t-rh"><b>{v.student}</b><time>{ago(v.date)}</time></div><Stars value={v.rating} /><p>{v.comment || <i className="note">No comment</i>}</p><span className="note">{v.course}</span></div>
                </li>
              ))}</ul> : <p className="note">No reviews yet.</p>}
            </section>
            <section className="card">
              <div className="chead"><h2>Recent Activity</h2><Link className="linkbtn" to={q('/teach/analytics')}>View All</Link></div>
              {data.activity.length ? <ul className="t-list">{data.activity.map((a, i) => (
                <li key={i} className="t-act">
                  <span className={`t-aic ${ACT[a.kind][1]}`}><Icon name={ACT[a.kind][0]} small /></span>
                  <div><div className="t-rh"><b>{a.title}</b><time>{ago(a.date)}</time></div><p>{a.text}</p></div>
                </li>
              ))}</ul> : <p className="note">Nothing yet.</p>}
            </section>
          </aside>
        </div>
      </>)}
      <OutlineDialog open={uploading} courseIds={mine} onClose={() => setUploading(false)} onDone={reload} />
    </>
  );
}
