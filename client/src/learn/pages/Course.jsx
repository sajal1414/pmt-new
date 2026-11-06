import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { RichView } from '../../components/RichText.jsx';
import { LessonNotes, LessonQA } from '../../pages/CourseDetail.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { isURL } from '../../lib/constants.js';
import BatchList from '../../components/BatchList.jsx';
import { Loading, ErrorNote, shortDate, ago } from '../shared.jsx';
import { useLearn, useLearnData, usePrice, Checkout, CourseThumb, LevelBadge, Stars, hoursLabel, ReviewForm } from '../lib.jsx';
import { MyRequests, RequestDialog } from '../RequestDialog.jsx';

const fmtMins = (m) => (!m ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const groupDays = (lessons) => lessons.reduce((g, l, i) => { const last = g[g.length - 1]; if (last && last.day === (l.day || '')) last.items.push({ l, i }); else g.push({ day: l.day || '', items: [{ l, i }] }); return g; }, []);

function ReviewBox({ courseId, instructor, mine, onSaved }) {
  return (
    <>
      <h2>{mine ? 'Your review' : 'Rate this course'}</h2>
      <ReviewForm key={mine?.date || 'new'} courseId={courseId} instructor={instructor} initial={mine} onDone={onSaved} />
      {mine?.reply && <div className="t-reply"><b>Instructor reply</b><p>{mine.reply}</p></div>}
    </>
  );
}

export default function Course() {
  const { id } = useParams();
  const { q, reloadSummary } = useLearn();
  const nav = useNavigate();
  const toast = useToast();
  const price = usePrice();
  const [params, setParams] = useSearchParams();
  const { data: c, loading, error, reload, setData } = useLearnData(`/api/learn/courses/${id}`);
  const { data: myReqs, reload: reloadReqs } = useLearnData('/api/learn/requests', { course: id });
  const [req, setReq] = useState(''); // 'batch' | 'change' | 'custom' while asking
  const [buy, setBuy] = useState(null); // { batch } while the checkout is open
  const [tab, setTab] = useState('lesson');
  const [busy, setBusy] = useState(false);
  const enrolled = !!c?.enrollment;
  const lessonId = params.get('lesson') || '';
  const done = useMemo(() => new Set(c?.enrollment?.done || []), [c]);
  const current = c?.lessons.find((l) => l.id === lessonId) || c?.lessons.find((l) => !done.has(l.id)) || c?.lessons[0];
  const idx = c && current ? c.lessons.indexOf(current) : -1;
  useEffect(() => { const t = params.get('tab'); setTab(t === 'reviews' || t === 'schedule' ? t : enrolled && c?.lessons.length ? 'lesson' : 'overview'); }, [enrolled, c?.lessons.length]);
  const open = (l) => { setParams((p) => { const n = new URLSearchParams(p); n.set('lesson', l.id); return n; }, { replace: true }); setTab('lesson'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const mark = async (l, value, next) => {
    setBusy(true);
    try {
      const r = await api.post(q(`/api/learn/courses/${id}/lessons/${l.id}`), { done: value });
      setData((d) => ({ ...d, enrollment: { ...d.enrollment, done: r.done, progress: r.progress, completed: r.completed } }));
      const gate = r.completed && value && r.progress === 100 && r.reviewNeeded;
      if (gate) { toast('Course completed! Leave a review to get your certificate.'); setTab('reviews'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else if (r.completed && value && r.progress === 100) toast('Course completed! Your certificate is ready.');
      if (next && !gate) open(next);
      reloadSummary();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  const toggleWish = async () => { try { const r = await api.post(q(`/api/learn/wishlist/${id}`)); setData((d) => ({ ...d, wishlisted: r.wishlist.includes(id) })); } catch (x) { toast(x.message); } };

  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!c) return loading && <Loading />;
  const e = c.enrollment;
  const next = idx >= 0 ? c.lessons[idx + 1] : null;
  const needsReview = !!e?.completed && !c.myReview;
  const certId = e?.completed && !needsReview ? e.id : null;

  // a course with batches is joined on one of them: Enroll on each batch, or which one is yours
  const enrollIn = (b) => {
    if (e) return e.batch?.id === b.id ? <span className="pill ok"><Icon name="check" small />Your batch</span> : null;
    const full = b.status === 'Full' || (b.seats !== '' && b.seats != null && b.booked >= +b.seats);
    return full ? <span className="pill red">Full</span>
      : <button type="button" className="btn sm primary" onClick={() => setBuy({ batch: b })}>Enroll in this batch<Icon name="arrow" small /></button>;
  };
  // booked on a batch: a lesson can be marked done from the day it's taught (its date, when that's still to come)
  const batchToday = c.enrollment?.batch?.today || '';
  const lockedOn = (l) => (l?.opensOn && batchToday && l.opensOn > batchToday ? l.opensOn : '');
  const dayLabel = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <>
      <Link to={q(enrolled ? '/learn/my-learning' : '/learn/explore')} className="back" style={{ alignSelf: 'flex-start' }}><Icon name="back" small />{enrolled ? 'My Learning' : 'Explore Courses'}</Link>
      <section className="card l-chero">
        <div className="l-cur-cover big"><CourseThumb course={c} /></div>
        <div className="l-cur-info">
          <span className="l-tags">{e && <span className={`l-src ${e.source}`}>{e.source === 'assigned' ? 'Instructor Assigned' : e.source === 'batch' ? 'Batch' : 'Enrolled'}</span>}<span className="chip">{c.platform}</span><LevelBadge level={c.level} />{c.customFor && <span className="l-custom"><Icon name="people" small />Custom for {c.customFor}</span>}{e?.payment === 'pending' && <span className="pill warn" title="Cash on delivery (testing)">Payment pending</span>}</span>
          {c.code && <span className="l-code">{c.code}</span>}
          <h1>{c.name}</h1>
          <span className="l-inst"><span className="l-inst-av" aria-hidden="true">{(c.instructor.name || '?')[0]}</span><b>{c.instructor.name || 'Hazdemy instructor'}</b><span className="note">| {c.instructor.title}</span></span>
          <span className="l-meta">{c.rating != null && <span><span className="st">★</span><b>{c.rating.toFixed(1)}</b>&nbsp;({c.ratings})</span>}<span><Icon name="book" small />{c.lessons.length} lessons</span><span><Icon name="clock" small />{hoursLabel(c.hours)}</span>{c.delivery && <span><Icon name="people" small />{c.delivery}</span>}{e?.deadline && <span><Icon name="cal" small />Deadline {shortDate(e.deadline)}</span>}</span>
          <div className="l-extra">
            <Link className="btn sm" to={q('/learn/advisor', { course: c.id })}><Icon name="msg" small />Ask Hazdemy</Link>
            {!e && <button type="button" className={`btn sm l-wish${c.wishlisted ? ' on' : ''}`} onClick={toggleWish} aria-pressed={!!c.wishlisted}><Icon name="heart" small />{c.wishlisted ? 'In wishlist' : 'Wishlist'}</button>}
            {!e && !c.schedule?.length && <button type="button" className="btn sm" onClick={() => setReq('batch')}><Icon name="cal" small />Request a new batch</button>}
            {e?.batch && <button type="button" className="btn sm" onClick={() => setReq('change')}><Icon name="clock" small />Request a batch change</button>}
            {!e && !c.customFor && <button type="button" className="btn sm l-custom-req" onClick={() => setReq('custom')}><Icon name="people" small />Need it for your team? <b>Request a custom version</b></button>}
          </div>
          {e && <div className="l-progress"><span>Your Progress</span><span className="tr"><i style={{ width: `${Math.max(e.progress, 1.5)}%` }} /></span><b className="num">{e.progress}%</b></div>}
        </div>
        <div className="l-buy">
          {e ? (needsReview ? <button className="btn primary" onClick={() => setTab('reviews')}><Icon name="star" small />Review to get certificate</button>
            : certId ? <a className="btn primary" href={q(`/api/learn/certificates/${certId}/pdf`)} download><Icon name="award" small />Download certificate</a>
            : c.lessons.length ? <button className="btn primary" onClick={() => open(current)}><Icon name="play" small />{e.progress ? 'Continue' : 'Start Course'}</button> : null)
            : (<><b className="l-price big">{price(c.price)}</b>{c.schedule?.length
              ? <button className="btn primary" onClick={() => setTab('schedule')}><Icon name="cal" small />Choose a batch</button>
              : <button className="btn primary" onClick={() => setBuy({})}>Enroll now<Icon name="arrow" small /></button>}</>)}
        </div>
      </section>
      {e?.completed && (needsReview
        ? <div className="l-done"><Icon name="star" /><span><b>Congratulations! You completed this course on {shortDate(e.completed)}.</b> Rate the course and instructor to get your certificate.</span><button className="btn sm primary" onClick={() => setTab('reviews')}>Write review</button></div>
        : <div className="l-done"><Icon name="award" /><span><b>Congratulations! You completed this course on {shortDate(e.completed)}.</b> Your certificate is ready to download.</span><Link className="btn sm" to={q('/learn/certificates')}>My Certificates</Link></div>)}
      {(c.baseCourse?.available || c.versions?.length > 0) && (
        <div className="cv-bar">
          {c.customFor && c.baseCourse?.available && <span className="cv-for"><Icon name="people" small />Custom version for <b>{c.customFor}</b> · based on <Link to={q('/learn/courses/' + c.baseCourse.id)}>{c.baseCourse.name}</Link></span>}
          {c.versions?.filter((v) => v.id !== c.baseCourse?.id).length > 0 && <span className="cv-list"><span className="note">{c.customFor ? 'Other versions:' : 'Also available as custom versions for:'}</span>
            {c.versions.filter((v) => v.id !== c.baseCourse?.id).map((v) => <Link key={v.id} className="chip" to={q('/learn/courses/' + v.id)} title={v.name}>{v.customFor || 'Standard course'}</Link>)}</span>}
        </div>
      )}
      <MyRequests list={myReqs} />

      <div className="t-tabs l-ctabs" role="tablist">
        {[enrolled && c.lessons.length && ['lesson', 'Lessons'], ['overview', 'Overview'], c.schedule?.length > 0 && ['schedule', `Schedule (${c.schedule.length})`], ['reviews', `Reviews (${c.ratings})`]].filter(Boolean).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'lesson' && enrolled && current && (
        <div className="l-player">
          <aside className="card l-outline" aria-label="Lessons">
            {groupDays(c.lessons).map((g, gi) => (
              <div key={gi}>
                {g.day && <h4>{g.day}</h4>}
                <ul>{g.items.map(({ l, i }) => (
                  <li key={l.id}><button className={`${l.id === current.id ? 'on' : ''}${done.has(l.id) ? ' done' : ''}`} onClick={() => open(l)}>
                    <span className="ck" aria-hidden="true">{done.has(l.id) ? <Icon name="check" small /> : i + 1}</span><span className="tx"><b>{l.title}</b>{l.mins ? <span>{fmtMins(l.mins)}</span> : null}{!done.has(l.id) && lockedOn(l) && <span className="l-opens"><Icon name="lock" small />Taught {dayLabel(lockedOn(l))}</span>}</span>
                  </button></li>
                ))}</ul>
              </div>
            ))}
          </aside>
          <section className="card l-lesson">
            <span className="note">Lesson {idx + 1} of {c.lessons.length}{current.day ? ` · ${current.day}` : ''}{current.mins ? ` · ${fmtMins(current.mins)}` : ''}</span>
            <h2>{current.title}</h2>
            {(current.video || current.attachment) && <div className="l-res">
              {current.video && (isURL(current.video) ? <a className="btn sm" href={current.video} target="_blank" rel="noopener noreferrer"><Icon name="video" small />Watch video</a> : <span className="chip">{current.video}</span>)}
              {current.attachment && (isURL(current.attachment) ? <a className="btn sm" href={current.attachment} target="_blank" rel="noopener noreferrer"><Icon name="clip" small />Attachment</a> : <span className="chip">{current.attachment}</span>)}
            </div>}
            {current.article ? <div className="l-notes"><LessonNotes text={current.article} /></div> : <p className="note">Your instructor hasn’t added notes for this lesson yet.</p>}
            <LessonQA items={current.qa} />
            <div className="l-lfoot">
              {idx > 0 && <button className="btn" onClick={() => open(c.lessons[idx - 1])}><Icon name="left" small />Previous</button>}
              <span style={{ flex: 1 }} />
              {done.has(current.id)
                ? <><button className="btn" disabled={busy} onClick={() => mark(current, false)}>Mark as not done</button>{next && <button className="btn primary" onClick={() => open(next)}>Next lesson<Icon name="right" small /></button>}</>
                : lockedOn(current)
                  ? <><span className="note l-opens-note"><Icon name="lock" small />Taught on {dayLabel(lockedOn(current))}: you can mark it complete from then.</span>{next && <button className="btn" onClick={() => open(next)}>Next lesson<Icon name="right" small /></button>}</>
                  : <button className="btn primary" disabled={busy} onClick={() => mark(current, true, next)}><Icon name="check" small />{next ? 'Mark complete & continue' : 'Mark complete'}</button>}
            </div>
          </section>
        </div>
      )}

      {tab === 'overview' && (
        <div className="t-two wide-left">
          <section className="card l-ov">
            {c.fullDescription && <><h2>About this course</h2><p className="prose" style={{ margin: 0 }}>{c.fullDescription}</p></>}
            {c.objectives && <><h2>What you’ll learn</h2><div className="syl-obj"><RichView value={c.objectives} /></div></>}
            <h2>Course outline</h2>
            {c.lessons.length ? groupDays(c.lessons).map((g, gi) => (
              <div key={gi} className="l-ovday">{g.day && <h4>{g.day}</h4>}<ol start={g.items[0].i + 1}>{g.items.map(({ l }) => <li key={l.id}><span>{l.title}</span>{l.mins ? <span className="note">{fmtMins(l.mins)}</span> : null}</li>)}</ol></div>
            )) : c.topics ? <RichView value={c.topics} /> : <p className="note">The detailed outline will be published soon.</p>}
          </section>
          <div className="t-col">
            {(c.persona || c.prereqs) && <section className="card">{c.persona && <><h2>Who it’s for</h2><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.persona}</p></>}{c.prereqs && <><h2>Prerequisites</h2><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.prereqs}</p></>}</section>}
            <section className="card"><h2>Instructor</h2><span className="l-inst big"><span className="l-inst-av" aria-hidden="true">{(c.instructor.name || '?')[0]}</span><span><b>{c.instructor.name || 'Hazdemy instructor'}</b><span className="note">{c.instructor.title}</span></span></span>
              {e && <button className="btn sm" onClick={() => nav(q('/learn/messages', { course: c.id }))}><Icon name="mail" small />Message instructor</button>}</section>
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <section className="card">
          <h2 style={{ margin: 0 }}>Upcoming batches</h2>
          <p className="note" style={{ margin: 0 }}>Class times are shown in the batch’s own time zone and in yours. Add other zones to compare.</p>
          <BatchList batches={c.schedule || []} empty={<p className="note">No batches scheduled yet.</p>} actions={enrollIn} />
          {e?.batch ? <p className="l-reqline">Need a different date or time? <button type="button" className="linkbtn" onClick={() => setReq('change')}><Icon name="clock" small />Request a batch change</button></p>
            : <p className="l-reqline">Can’t find a date that suits you? <button type="button" className="linkbtn" onClick={() => setReq('batch')}><Icon name="cal" small />Request a new batch</button></p>}
        </section>
      )}

      {tab === 'reviews' && (
        <div className="t-two wide-left">
          <section className="card">
            <div className="chead"><h2>Learner reviews</h2>{c.rating != null && <span className="t-avg"><b>{c.rating.toFixed(1)}</b><Stars value={c.rating} /><span className="note">{c.ratings} reviews</span></span>}</div>
            {c.reviews.length ? <ul className="t-list">{c.reviews.map((v) => <li key={v.id} className="t-review"><div><div className="t-rh"><b>{v.student}</b><time>{ago(v.date)}</time></div><Stars value={v.rating} /><p>{v.comment}</p>{v.instructorRating && <div className="l-irev"><span className="note">Instructor</span><Stars value={v.instructorRating} />{v.instructorComment && <p>{v.instructorComment}</p>}</div>}{v.reply && <div className="t-reply"><b>Instructor reply</b><p>{v.reply}</p></div>}</div></li>)}</ul> : <p className="note">No reviews yet.</p>}
          </section>
          {e && <section className="card">{needsReview && <p className="l-revgate"><Icon name="award" small />Submit your review to unlock your certificate.</p>}<ReviewBox courseId={c.id} instructor={c.instructor?.name} mine={c.myReview} onSaved={() => { if (needsReview) toast('Thanks for your review! Your certificate is ready.'); reload(); reloadSummary(); }} /></section>}
        </div>
      )}
      <Checkout course={buy ? { ...c, lessons: c.lessons.length } : null} batch={buy?.batch} onClose={() => setBuy(null)} onDone={reload} />
      <RequestDialog kind={req} course={c} current={(c.schedule || []).find((b) => b.id === e?.batch?.id) || e?.batch} onClose={() => setReq('')} onDone={reloadReqs} />
    </>
  );
}
