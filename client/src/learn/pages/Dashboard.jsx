import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { AREA_COLOR, platformTone } from '../../lib/constants.js';
import { Loading, ErrorNote, shortDate, platformIconOf } from '../shared.jsx';
import { useLearn, useLearnData, CourseCard, HeroArt, CourseThumb, LevelBadge, firstName, hoursLabel } from '../lib.jsx';

const CAT_TONE = ['blue', 'green', 'violet', 'orange', 'pink'];

function Stats({ s, fresh }) {
  const tiles = fresh
    ? [['book', 'blue', s.enrolled, 'Enrolled Courses'], ['clock', 'orange', `${s.hours}h`, 'Learning Time'], ['award', 'green', s.certificates, 'Certificates'], ['flame', 'red', s.streak, 'Day Streak']]
    : [['book', 'blue', s.enrolled, s.assigned === s.enrolled ? `Assigned Course${s.enrolled === 1 ? '' : 's'}` : 'Enrolled Courses'], ['clock', 'orange', `${s.progress}%`, 'Overall Progress'], ['award', 'green', s.certificates, 'Certificates'], ['flame', 'red', s.streak, 'Day Streak']];
  return <div className="l-stats">{tiles.map(([ic, tone, v, l]) => <div key={l} className={`l-stat ${tone}`}><span className="l-stat-h"><span className={`l-sic ${tone}`}><Icon name={ic} /></span><span>{l}</span></span><b className="num">{v}</b></div>)}</div>;
}

function QuickLinks({ fresh, q, onGoals }) {
  const links = fresh
    ? [['/learn/explore', 'search', 'blue', 'Explore Courses', 'Browse the full course catalog'], ['/learn/explore?view=categories', 'home', 'green', 'Browse Categories', 'Find courses by subject'], [null, 'book', 'orange', 'Learning Guide', 'Tips to get started'], ['mailto:support@hazdemy.com', 'help', 'violet', 'Help & Support', 'Get help when you need it']]
    : [['/learn/explore', 'search', 'blue', 'Browse More Courses', 'Explore new skills and topics'], ['/learn/certificates', 'award', 'green', 'My Certificates', 'View your achievements'], ['mailto:support@hazdemy.com', 'help', 'violet', 'Support', 'Get help when you need it']];
  return (
    <ul className="l-links">{links.map(([to, ic, tone, t, sub]) => {
      const inner = <><span className={`l-lic ${tone}`}><Icon name={ic} /></span><span className="tx"><b>{t}</b><span>{sub}</span></span><Icon name="right" small /></>;
      return <li key={t}>{to?.startsWith('mailto:') ? <a href={to}>{inner}</a> : to ? <Link to={q(to.split('?')[0], Object.fromEntries(new URLSearchParams(to.split('?')[1] || '')))}>{inner}</Link> : <button onClick={onGoals}>{inner}</button>}</li>;
    })}</ul>
  );
}

export default function Dashboard() {
  const { q, summary } = useLearn();
  const nav = useNavigate();
  const { data, loading, error, reload } = useLearnData('/api/learn/overview');
  const advisor = () => nav(q('/learn/advisor', { act: 'choose' }));
  const name = firstName(summary?.student?.name);
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  const fresh = data.fresh, cur = data.current;

  return (
    <>
      {/* hero */}
      <section className="l-hero fresh">
        <div className="l-hero-tx">
          <h1>Hello, {name || 'there'}! <span aria-hidden="true">👋</span></h1>
          <p>Welcome to Hazdemy! Discover courses, gain new skills and grow your career at your own pace.</p>
          <ul className="l-feats">{[['target', 'Learn', 'at your pace'], ['play', 'Expert', 'instructors'], ['award', 'Get', 'certificates'], ['trendup', 'Grow', 'your career']].map(([ic, a, b]) => <li key={a}><Icon name={ic} /><span>{a}<br />{b}</span></li>)}</ul>
          <div className="l-choose">
            <div className="actions"><button className="btn primary" onClick={() => advisor()}>Let us help you to choose<Icon name="arrow" small /></button><button className="btn" onClick={() => nav(q('/learn/explore'))}><Icon name="home" small />Browse All Courses</button></div>
          </div>
        </div>
        <HeroArt />
        <blockquote className="l-quote"><span className="script">Small steps<br />lead to big results!</span></blockquote>
      </section>

      <div className="t-grid">
        <div className="t-col">
          {!fresh && cur && (
            <section className="card l-current">
              <div className="l-cur-top">
                <div className="l-cur-cover"><CourseThumb course={cur.course} /></div>
                <div className="l-cur-info">
                  <span className={`l-src ${cur.source}`}>{cur.source === 'assigned' ? 'Instructor Assigned' : cur.completed ? 'Completed' : cur.source === 'batch' ? 'Batch' : 'Enrolled'}</span>
                  {cur.course.code && <span className="l-code">{cur.course.code}</span>}
                  <h2>{cur.course.name}</h2>
                  <span className="l-inst"><span className="l-inst-av" aria-hidden="true">{(cur.course.instructor.name || '?')[0]}</span><b>{cur.course.instructor.name}</b><span className="note">| {cur.course.instructor.title}</span></span>
                  <span className="l-meta"><span><Icon name="book" small />{cur.course.lessons} lessons</span><span><Icon name="clock" small />{hoursLabel(cur.course.hours)}</span>{cur.deadline && <span><Icon name="cal" small />Deadline: {shortDate(cur.deadline)}</span>}<LevelBadge level={cur.course.level} /></span>
                  {cur.course.description && <p className="note" style={{ margin: 0 }}>{cur.course.description}</p>}
                </div>
                <button className="btn primary l-start" onClick={() => nav(q('/learn/courses/' + cur.course.id))}><Icon name="play" small />{cur.completed ? 'Review Course' : cur.progress ? 'Continue' : 'Start Course'}<Icon name="arrow" small /></button>
              </div>
              <div className="l-progress"><span>Your Progress</span><span className="tr"><i style={{ width: `${Math.max(cur.progress, 1.5)}%` }} /></span><b className="num">{cur.progress}%</b></div>
              {data.enrollments.length > 1 && <Link className="linkbtn" to={q('/learn/my-learning')} style={{ alignSelf: 'flex-start' }}>All my courses ({data.enrollments.length}) →</Link>}
            </section>
          )}

          {fresh && data.categories.length > 0 && (
            <section>
              <div className="l-sh"><h2>Explore Course Categories</h2><Link className="linkbtn" to={q('/learn/explore', { view: 'categories' })}>View All Categories →</Link></div>
              <div className="l-cats">{data.categories.map((c, i) => (
                <Link key={c.name} to={q('/learn/explore', { category: c.name })} className={`l-cat ${AREA_COLOR[platformTone(c.name)] ? 'area ' + platformTone(c.name) : CAT_TONE[i % CAT_TONE.length]}`}><span className="l-cat-ic"><Icon name={platformIconOf(c.name)} /></span><b>{c.name}</b><span>{c.count} Courses →</span></Link>
              ))}</div>
            </section>
          )}

          <section>
            <div className="l-sh"><div><h2>{fresh ? 'Popular Courses' : 'Recommended Courses'}</h2>{!fresh && <p className="note" style={{ margin: 0 }}>Based on your interests and learning goals</p>}</div><Link className="linkbtn" to={q('/learn/explore')}>View All →</Link></div>
            <div className="l-grid4">{data.recommendations.map((c) => <CourseCard key={c.id} c={c} onChanged={reload} />)}</div>
          </section>

          {!fresh && (
            <section className="l-goalbar"><Icon name="target" /><span><b>Set your learning goals</b> and get personalized recommendations.</span><button className="btn sm" onClick={() => advisor()}>Set Goals<Icon name="arrow" small /></button></section>
          )}
        </div>

        <aside className="t-col t-aside">
          {!fresh && (
            <section className="card">
              <div className="chead"><h2>Your Learning Stats</h2><Link className="linkbtn" to={q('/learn/my-learning')}>View Details →</Link></div>
              <Stats s={data.stats} fresh={fresh} />
            </section>
          )}
          {!fresh && (
            <section className="card">
              <div className="chead"><h2>Upcoming Deadlines</h2><Link className="linkbtn" to={q('/learn/my-learning')}>View All →</Link></div>
              {data.deadlines.length ? <ul className="l-dead">{data.deadlines.map((x) => (
                <li key={x.id}><Link to={q('/learn/courses/' + x.courseId)}><span className="l-dic"><Icon name="cal" /></span><span className="tx"><b>{x.name}</b><span>Course completion deadline</span></span><time className={x.deadline < new Date().toISOString().slice(0, 10) ? 'late' : ''}>{shortDate(x.deadline)}</time></Link></li>
              ))}</ul> : <p className="note" style={{ margin: 0 }}>No deadlines. Learn at your own pace.</p>}
            </section>
          )}
          <section className="card"><h2>Quick Links</h2><QuickLinks fresh={fresh} q={q} onGoals={() => advisor()} /></section>
          {fresh && (
            <section className="card l-journey">
              <span className="l-trophy" aria-hidden="true">🏆</span>
              <div><h2>Start Your Learning Journey</h2><p className="note">Choose courses, set your goals and track your progress.</p></div>
              <button className="btn primary" onClick={() => advisor()}>Set Learning Goals<Icon name="arrow" small /></button>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
