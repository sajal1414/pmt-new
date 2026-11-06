import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Loading, ErrorNote, shortDate, ago } from '../shared.jsx';
import { useLearn, useLearnData, CourseThumb, LevelBadge, hoursLabel } from '../lib.jsx';

const TABS = [['all', 'All'], ['progress', 'In progress'], ['assigned', 'Assigned'], ['completed', 'Completed']];

export default function MyLearning() {
  const { q } = useLearn();
  const nav = useNavigate();
  const { data, loading, error, reload } = useLearnData('/api/learn/enrollments');
  const [tab, setTab] = useState('all');
  const today = new Date().toISOString().slice(0, 10);
  const counts = useMemo(() => { const l = data || []; return { all: l.length, progress: l.filter((e) => !e.completed).length, assigned: l.filter((e) => e.source === 'assigned').length, completed: l.filter((e) => e.completed).length }; }, [data]);
  const list = useMemo(() => (data || []).filter((e) => tab === 'all' || (tab === 'progress' ? !e.completed : tab === 'assigned' ? e.source === 'assigned' : !!e.completed))
    .sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || (a.deadline || '9999').localeCompare(b.deadline || '9999') || (b.lastActive || '').localeCompare(a.lastActive || '')), [data, tab]);
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  return (
    <>
      <section className="t-head"><div><h1>My Learning</h1><p>Your enrolled and assigned courses, with progress and deadlines.</p></div><Link className="btn primary" to={q('/learn/explore')}><Icon name="search" small />Explore courses</Link></section>
      <div className="t-tabs l-ctabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span>({counts[k]})</span></button>)}</div>
      {list.length ? (
        <section className="l-mylist">{list.map((e) => (
          <article key={e.id} className="card l-myrow" onClick={() => nav(q('/learn/courses/' + e.course.id))}>
            <div className="l-cur-cover"><CourseThumb course={e.course} /></div>
            <div className="l-cur-info">
              <span className="l-tags"><span className={`l-src ${e.source}`}>{e.source === 'assigned' ? `Assigned${e.assignedBy ? ' by ' + e.assignedBy : ''}` : e.source === 'batch' ? 'Batch' : 'Enrolled'}</span><LevelBadge level={e.course.level} />{e.payment === 'pending' && <span className="pill warn">Payment pending</span>}</span>
              {e.course.code && <span className="l-code">{e.course.code}</span>}
              <b className="l-cname">{e.course.name}</b>
              <span className="l-meta"><span><Icon name="user" small />{e.course.instructor.name}</span><span><Icon name="book" small />{e.course.lessons} lessons</span><span><Icon name="clock" small />{hoursLabel(e.course.hours)}</span>
                {e.deadline && !e.completed && <span className={e.deadline < today ? 'late' : ''}><Icon name="cal" small />Due {shortDate(e.deadline)}</span>}
                <span>{e.completed ? `Completed ${shortDate(e.completed)}` : e.lastActive ? `Active ${ago(e.lastActive)}` : `Enrolled ${shortDate(e.enrolled)}`}</span></span>
              <div className="l-progress"><span className="tr"><i style={{ width: `${Math.max(e.progress, 1.5)}%` }} /></span><b className="num">{e.progress}%</b></div>
            </div>
            <button className={`btn ${e.completed ? '' : 'primary'}`} onClick={(x) => { x.stopPropagation(); nav(q('/learn/courses/' + e.course.id)); }}>{e.completed ? 'Review' : e.progress ? 'Continue' : 'Start'}<Icon name="arrow" small /></button>
          </article>
        ))}</section>
      ) : <div className="card"><div className="empty"><Icon name="cap" /><b>{data.length ? 'Nothing here' : 'You haven’t started any courses yet'}</b><span>{data.length ? 'Try another tab.' : 'Find a course you like, or wait for your instructor to assign one.'}</span>{!data.length && <Link className="btn sm primary" to={q('/learn/explore')}>Explore courses</Link>}</div></div>}
    </>
  );
}
