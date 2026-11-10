import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Dialog } from '../components/ui.jsx';
import { api } from '../api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/store.jsx';
import { CourseThumb, Stars } from '../teach/lib.jsx';
import { clock, dateRange, localZone, timesIn, zoneAbbr, zoneName } from '../lib/timezones.js';

/* ---------- who we're looking at (learners: themselves; admins: ?as=<studentId>) ---------- */
const LearnCtx = createContext(null);
export function LearnProvider({ children }) {
  const { user } = useAuth();
  const admin = user.role === 'Admin';
  const [params, setParams] = useSearchParams();
  const [learners, setLearners] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const as = admin ? params.get('as') || read('atlas-learn-as') || '' : '';
  useEffect(() => { if (admin) api.get('/api/learn/learners').then(setLearners).catch((e) => setError(e.message)); }, [admin]);
  const setAs = useCallback((id) => {
    try { localStorage.setItem('atlas-learn-as', id); } catch { /* storage blocked */ }
    setParams((p) => { const n = new URLSearchParams(p); n.set('as', id); return n; }, { replace: true });
  }, [setParams]);
  // no learner chosen yet, or the remembered one no longer exists: show the first
  useEffect(() => { if (admin && learners.length && (!as || !learners.some((l) => l.id === as))) setAs(learners[0].id); }, [admin, as, learners]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useCallback((url, extra = {}) => {
    const p = new URLSearchParams(extra);
    if (admin && as) p.set('as', as);
    const s = p.toString();
    return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url;
  }, [admin, as]);
  const ready = !admin || !!as;
  const reloadSummary = useCallback(() => { if (ready) api.get(q('/api/learn/summary')).then((s) => { setSummary(s); setError(''); }).catch((e) => setError(e.message)); }, [q, ready]);
  useEffect(() => { reloadSummary(); }, [reloadSummary]);
  const value = useMemo(() => ({ admin, as, setAs, learners, summary, reloadSummary, q, ready, error }), [admin, as, setAs, learners, summary, reloadSummary, q, ready, error]);
  return <LearnCtx.Provider value={value}>{children}</LearnCtx.Provider>;
}
export const useLearn = () => useContext(LearnCtx);

export function useLearnData(path, extra = {}) {
  const { q, ready } = useLearn();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const key = q(path, extra);
  const load = useCallback(() => {
    if (!ready) return;
    setState((s) => ({ ...s, loading: true }));
    api.get(key).then((data) => setState({ data, loading: false, error: '' })).catch((e) => setState({ data: null, loading: false, error: e.message }));
  }, [key, ready]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

/** Price in the payment currency (from server/.env). No courses are free: a course without a price is "Price on request". */
export const hasPrice = (c) => +c?.price > 0;
export function usePrice() {
  const { summary } = useLearn();
  const currency = summary?.payments?.currency || 'USD';
  return useCallback((n) => (!(+n > 0) ? 'Price on request' : new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(+n)), [currency]);
}
export const firstName = (n) => String(n || '').replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '').split(' ')[0];
export const hoursLabel = (h) => (!h ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 10) / 10} hours`);
const LEVEL_TONE = { Beginner: 'ok', Intermediate: 'acc', Advanced: 'warn' };
export const LevelBadge = ({ level }) => <span className={`l-level ${LEVEL_TONE[level] || 'ok'}`}>{level}</span>;

/* ---------- course card (dashboard recommendations, explore, wishlist) ---------- */
/** "Next batch Tue, Nov 10 · 9:00 AM IST" on a course card, in the viewer's own time zone (the batch's own time on hover). */
function NextBatchLine({ b, more }) {
  if (!b) return null;
  const here = localZone(), at = new Date(b.startUtc);
  const date = at.toLocaleDateString('en-US', { timeZone: here, weekday: 'short', month: 'short', day: 'numeric' });
  const time = at.toLocaleTimeString('en-US', { timeZone: here, hour: 'numeric', minute: '2-digit' });
  const own = here !== b.timeZone ? `${timesIn(b, b.timeZone).times} ${zoneAbbr(b.timeZone, at.getTime())} (${zoneName(b.timeZone)} time)` : '';
  const started = b.startDate <= new Date().toISOString().slice(0, 10);
  return (
    <span className="l-next-b" title={own ? `Batch time: ${own}` : undefined}>
      <Icon name="cal" small /><span><b>{started ? 'In progress' : 'Next batch'}</b> {date} · {time} {zoneAbbr(here, at.getTime())}{more > 0 && <span className="note"> · +{more} more</span>}</span>
    </span>
  );
}

/** `versions`: the client versions of this course, listed on its card instead of as cards of their own. */
export function CourseCard({ c, onChanged, versions = [] }) {
  const { q } = useLearn();
  const nav = useNavigate();
  const toast = useToast();
  const price = usePrice();
  const [buy, setBuy] = useState(false);
  const [wish, setWish] = useState(!!c.wishlisted);
  const toggleWish = async (e) => {
    e.stopPropagation();
    try { const r = await api.post(q(`/api/learn/wishlist/${c.id}`)); const on = r.wishlist.includes(c.id); setWish(on); toast(on ? 'Added to wishlist' : 'Removed from wishlist'); onChanged?.(); } catch (x) { toast(x.message); }
  };
  return (
    <article className="l-card" onClick={() => nav(q('/learn/courses/' + c.id))}>
      <div className="l-cover"><CourseThumb course={c} /><LevelBadge level={c.level} />
        <button className={`l-heart${wish ? ' on' : ''}`} onClick={toggleWish} aria-label={wish ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={wish} title={wish ? 'Remove from wishlist' : 'Add to wishlist'}><Icon name="heart" small /></button>
      </div>
      <div className="l-cbody">
        {c.code && <span className="l-code">{c.code}</span>}
        <b className="l-cname">{c.name}</b>
        {c.customFor && <span className="l-custom" title={c.baseCourse ? `Custom version of ${c.baseCourse.name}` : 'Custom version'}><Icon name="people" small />Custom for {c.customFor}</span>}
        <span className="l-inst"><span className="l-inst-av" aria-hidden="true">{(c.instructor.name || '?')[0]}</span>{c.instructor.name || 'Hazdemy instructor'}</span>
        <span className="l-rate">{c.rating != null ? <><span className="st">★</span><b>{c.rating.toFixed(1)}</b><span>({c.ratings})</span></> : <span className="note">New</span>}</span>
        <span className="l-meta"><span><Icon name="book" small />{c.lessons} lessons</span><span><Icon name="clock" small />{hoursLabel(c.hours)}</span></span>
        <NextBatchLine b={c.nextBatch} more={c.batches - 1} />
        {versions.length > 0 && <span className="l-versions"><span className="note">Custom versions:</span>{versions.slice(0, 2).map((v) => (
          <button key={v.id} type="button" className="l-vchip" title={v.name} onClick={(e) => { e.stopPropagation(); nav(q('/learn/courses/' + v.id)); }}>{v.customFor}</button>
        ))}{versions.length > 2 && <span className="note">+{versions.length - 2} more</span>}</span>}
        <div className="l-cfoot">
          <b className={`l-price${hasPrice(c) ? '' : ' ask'}`}>{price(c.price)}</b>
          {c.enrolled ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); nav(q('/learn/courses/' + c.id)); }}>Continue</button>
            : !hasPrice(c) ? <button className="btn sm l-enroll" onClick={(e) => { e.stopPropagation(); nav(q('/learn/courses/' + c.id, { ask: 'details' })); }}>Ask for details</button>
            : c.nextBatch ? <button className="btn sm l-enroll" onClick={(e) => { e.stopPropagation(); nav(q('/learn/courses/' + c.id, { tab: 'schedule' })); }}>Choose batch</button>
            : <button className="btn sm l-enroll" onClick={(e) => { e.stopPropagation(); setBuy(true); }}>Enroll</button>}
        </div>
      </div>
      <Checkout course={buy ? c : null} onClose={() => setBuy(false)} />
    </article>
  );
}

/* ---------- checkout: Stripe only, and only for courses with a price ---------- */
// Paying leaves for Stripe's hosted page; Stripe sends the learner back to the course page with ?paid=<session>,
// where the Course page asks the server to confirm it (see Course.jsx). There is no cash on delivery or pay-later.
export function Checkout({ course, batch, onClose }) {
  const { q, summary, admin } = useLearn();
  const price = usePrice();
  const cfg = summary?.payments || { stripe: false };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (course) { setBusy(false); setError(''); } }, [course]);
  if (!course || !hasPrice(course)) return null;
  const pay = async () => {
    setBusy(true); setError('');
    try {
      const { url } = await api.post(q('/api/learn/checkout'), { courseId: course.id, batchId: batch?.id, method: 'stripe' });
      window.location.assign(url); // stays "Taking you to payment…" while the browser leaves for Stripe
    } catch (x) { setError(x.message); setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Checkout" subtitle={course.name}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={pay} disabled={busy || !cfg.stripe}><Icon name="lock" small />{busy ? 'Taking you to payment…' : `Pay ${price(course.price)}`}</button></>}>
      <div className="l-co" onClick={(e) => e.stopPropagation()}>
        <div className="l-co-course"><CourseThumb course={course} /><div><b>{course.name}</b><span className="note">{course.instructor?.name} · {course.lessons} lessons · {hoursLabel(course.hours)}</span></div><b className="l-price big">{price(course.price)}</b></div>
        {batch && <p className="l-co-batch"><Icon name="cal" small /><span>Batch: <b>{dateRange(batch)}</b> · {clock(batch.startTime)} – {clock(batch.endTime)} {timesIn(batch, batch.timeZone).abbr} · {batch.mode}</span></p>}
        {cfg.stripe
          ? <p className="note" style={{ margin: 0 }}><Icon name="lock" small /> You’ll pay on Stripe’s secure page by card or another method, then come straight back here, enrolled.{cfg.testMode ? ' (Test mode: no real money moves.)' : ''}</p>
          : <p className="note" style={{ margin: 0 }}>Online payment isn’t available right now. Please try again later or contact us.</p>}
        {admin && <p className="note" style={{ margin: 0 }}>You’re an admin viewing as this learner; the enrollment is made for them.</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

/** Decorative hero art: a laptop with learning icons floating around it (no external images). */
export function HeroArt() {
  return (
    <svg className="l-art" viewBox="0 0 300 170" aria-hidden="true">
      <defs><linearGradient id="lg1" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#8E1B1E" /><stop offset="1" stopColor="#7C3AED" /></linearGradient></defs>
      <ellipse cx="150" cy="160" rx="110" ry="8" fill="#8E1B1E" opacity=".10" />
      <rect x="92" y="62" width="116" height="74" rx="8" fill="url(#lg1)" />
      <rect x="99" y="69" width="102" height="60" rx="4" fill="#fff" opacity=".95" />
      <rect x="107" y="78" width="54" height="6" rx="3" fill="#8E1B1E" opacity=".8" /><rect x="107" y="90" width="80" height="5" rx="2.5" fill="#E2D3D0" /><rect x="107" y="100" width="66" height="5" rx="2.5" fill="#E2D3D0" />
      <rect x="107" y="111" width="40" height="10" rx="5" fill="#14A36B" />
      <path d="M78 138h144l-10 10H88z" fill="#A88F8B" />
      <g><circle cx="62" cy="58" r="20" fill="#E9A23B" /><path d="M56 62a8 8 0 1 1 12 0v4h-12z M57 70h10" stroke="#9A6512" strokeWidth="2.2" fill="none" strokeLinecap="round" /></g>
      <g><rect x="226" y="34" width="38" height="38" rx="11" fill="#F6EBE8" /><path d="M235 45h9a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3h-10z M257 45h-9a4 4 0 0 0-4 4" stroke="#7C3AED" strokeWidth="2.2" fill="none" strokeLinejoin="round" /></g>
      <g><circle cx="244" cy="118" r="17" fill="#FFE4D5" /><path d="M237 125v-8M244 125v-13M251 125v-5" stroke="#E8622B" strokeWidth="3" strokeLinecap="round" /></g>
      <g><rect x="40" y="104" width="34" height="34" rx="10" fill="#E7F6EF" /><path d="m49 121 6 6 11-12" stroke="#14A36B" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
      <g><circle cx="150" cy="30" r="17" fill="#F8E9E8" /><path d="M140 30l10-5 10 5-10 5z M144 32v5c3 2 9 2 12 0v-5" stroke="#8E1B1E" strokeWidth="2" fill="none" strokeLinejoin="round" /></g>
    </svg>
  );
}

export { CourseThumb, Stars };

/* ---------- review form: one rating for the course, one for the instructor, each with an optional comment ---------- */
const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
function StarQuestion({ id, label, value, onChange, comment, onComment, placeholder }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="l-rq">
      <legend>{label}</legend>
      <div className="l-rq-row">
        <div className="l-starpick" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}, ${STAR_WORDS[n]}`} className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)}>★</button>)}
        </div>
        <span className={'l-rq-word' + (shown ? '' : ' none')}>{shown ? STAR_WORDS[shown] : 'Select rating'}</span>
      </div>
      <label className="sr" htmlFor={id}>Write your review (optional)</label>
      <textarea id={id} rows={3} placeholder={placeholder} value={comment} onChange={(e) => onComment(e.target.value)} />
    </fieldset>
  );
}
export function ReviewForm({ courseId, instructor, initial, onDone, onCancel }) {
  const { q } = useLearn();
  const toast = useToast();
  const [f, setF] = useState({ rating: initial?.rating || 0, comment: initial?.comment || '', instructorRating: initial?.instructorRating || 0, instructorComment: initial?.instructorComment || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const missing = !f.rating ? 'Rate the course to post your review.' : !f.instructorRating ? 'Rate the instructor to post your review.' : '';
  const save = async () => {
    setBusy(true);
    try { await api.post(q('/api/learn/reviews'), { courseId, ...f }); toast(initial ? 'Review updated' : 'Thanks for your review!'); onDone?.(); } catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="l-rbox">
      <StarQuestion id={'rc-' + courseId} label="How would you rate this course?" value={f.rating} onChange={set('rating')} comment={f.comment} onComment={set('comment')}
        placeholder="Write your review (optional): what did you like, what could be better?" />
      <StarQuestion id={'ri-' + courseId} label={`How would you rate the instructor${instructor ? `, ${instructor}` : ''}?`} value={f.instructorRating} onChange={set('instructorRating')} comment={f.instructorComment} onComment={set('instructorComment')}
        placeholder="Write your review (optional): clarity, pace, how they answered questions" />
      <div className="actions">
        {missing && <span className="note">{missing}</span>}
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button type="button" className="btn sm primary" disabled={!!missing || busy} onClick={save}>{busy ? 'Saving…' : initial ? 'Update review' : 'Post review'}</button>
      </div>
    </div>
  );
}
