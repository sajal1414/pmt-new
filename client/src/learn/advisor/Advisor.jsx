import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';
import { useLearn, usePrice, CourseThumb, firstName } from '../lib.jsx';
import { AREAS, ROLES, EXPERIENCE, LEVELS, areaOf, daysOf, lengthLabel, vocabulary, parse, search, suggestions, learningPath, similar, findCourse, intent } from './engine.js';

/* The Hazdemy course advisor for learners, on its own page (/learn/advisor).
   The conversation is kept in sessionStorage, so it is still there after visiting other pages and clears when the tab closes.
   ?course=<id> says which course the learner came from; ?act=choose starts "Help me choose". */

const KEY = 'atlas-advisor';
const PAGE = 3;
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const newId = () => Math.random().toString(36).slice(2, 10);
const EMPTY = { focus: null, results: null, flow: null, seen: null };
const OPENING = [['Help me choose', 'choose'], ['Browse all areas', 'areas'], ['Short courses', 'short'], ['Highest rated', 'rated'], ['Most popular', 'popular'], ['Get details', 'details']];
const FOLLOW = [['Prerequisites?', 'q:prereqs'], ['Who should attend?', 'q:audience'], ['How long?', 'q:length'], ['Level?', 'q:level'], ['Similar courses', 'q:similar'], ['Get details', 'details']];
const PAGES = { explore: ['/learn/explore', 'Explore Courses'], contact: ['/learn/contact', 'the contact form'], 'my-learning': ['/learn/my-learning', 'My Learning'], certificates: ['/learn/certificates', 'My Certificates'], home: ['/learn', 'your dashboard'], wishlist: ['/learn/wishlist', 'your wishlist'] };

function load() {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.msgs)) return s; } catch { /* storage blocked or bad JSON */ }
  return { msgs: [], ctx: EMPTY };
}

/** **bold** inside bot text. */
const rich = (t) => String(t).split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));

export default function Advisor() {
  const { q, summary, ready } = useLearn();
  const price = usePrice();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const saved = useMemo(load, []);
  const open = true;
  const [msgs, setMsgs] = useState(saved.msgs);
  const [ctx, setCtxState] = useState(saved.ctx || EMPTY);
  const [courses, setCourses] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(null);
  const busy = useRef(false);
  const ctxRef = useRef(ctx);
  const log = useRef(null);
  const input = useRef(null);
  const rec = useRef(null);
  const setCtx = (patch) => { ctxRef.current = { ...ctxRef.current, ...patch }; setCtxState(ctxRef.current); };

  const byId = useMemo(() => new Map((courses || []).map((c) => [c.id, c])), [courses]);
  const vocab = useMemo(() => vocabulary(courses || []), [courses]);
  const name = firstName(summary?.student?.name);
  const pageCourse = params.get('course');
  const Speech = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

  useEffect(() => { if (ready && open && !courses) api.get(q('/api/learn/advisor')).then(setCourses).catch(() => setCourses([])); }, [ready, open, courses, q]);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: msgs.map((m) => ({ ...m, text: m.full ?? m.text })), ctx })); } catch { /* storage blocked */ } }, [msgs, ctx]);
  useEffect(() => { const el = log.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' }); }, [msgs, typing]);

  /* ---------- talking ---------- */
  const say = async (body, extra = {}) => {
    setTyping(true);
    await wait(380 + Math.min(body.length * 6, 700));
    setTyping(false);
    const id = newId();
    setMsgs((m) => [...m, { id, from: 'bot', text: reduced ? body : '', full: body, ...extra }]);
    if (!reduced) {
      for (let i = 0; i < body.length; i += 4) { const part = body.slice(0, i); setMsgs((m) => m.map((x) => (x.id === id ? { ...x, text: part } : x))); await wait(12); }
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, text: body } : x)));
    }
  };
  const me = (body) => setMsgs((m) => [...m.map((x) => (x.chips ? { ...x, chips: null } : x)), { id: newId(), from: 'me', text: body }]);
  const course = (id) => byId.get(id);
  const resultChips = (r) => [r.shown < r.ids.length && ['Show more', 'more'], r.ids.length >= 2 && ['Compare top 2', 'compare2'], ['Shortest first', 'shortest'], ['Highest rated', 'rated'], ['Most popular', 'popular'], ['Start over', 'restart']].filter(Boolean);

  const showResults = async (ids, intro, steps) => {
    const r = { ids, shown: Math.min(PAGE, ids.length), steps: steps || null };
    setCtx({ results: r });
    await say(intro, { kind: 'cards', ids: ids.slice(0, PAGE), steps: steps ? steps.slice(0, PAGE) : null, chips: resultChips(r) });
  };

  const greet = async () => {
    const c = pageCourse && course(pageCourse);
    if (c) {
      setCtx({ focus: c.id, seen: c.id });
      await say(`Hi${name ? ` ${name}` : ''}! 👋 I'm the Hazdemy course advisor. I see you're looking at **${c.code} · ${c.name}**. What would you like to know?`,
        { chips: [['Prerequisites?', 'q:prereqs'], ['Who should attend?', 'q:audience'], ['Similar courses', 'q:similar'], ['Get details', 'details']] });
      return;
    }
    await say(`Hi${name ? ` ${name}` : ''}! 👋 I'm the Hazdemy course advisor. I can help you choose a course, find one by name or topic, or answer questions about our training. What would you like to do?`, { chips: OPENING });
  };

  const handover = async (id) => {
    const c = id && course(id);
    const subject = c ? `Details request: ${c.code} · ${c.name}` : 'Training enquiry';
    await say(c ? `Great! I'm opening the contact form with **${c.name}** already selected. Just add your name and email, and our team will send you the details.`
      : 'Sure! I\'m opening the contact form. Add your name and email, tell us what you\'re looking for, and our team will get back to you.');
    nav(q('/learn/contact', c ? { course: c.id, subject } : { subject }));
  };

  const answerAbout = async (kind, c) => {
    const rest = FOLLOW.filter(([, a]) => a !== kind).slice(0, 4).concat([['Yes, get details', 'details']]).filter((x, i, a) => a.findIndex((y) => y[1] === x[1]) === i);
    const area = c.product || areaOf(c);
    if (kind === 'q:prereqs') return say(c.prereqs ? `Before **${c.name}**, you should have: ${c.prereqs}` : `No formal prerequisites are listed for **${c.name}**. ${c.level === 'Foundational' ? 'It\'s a foundational course, so it\'s a good place to start.' : `Some hands-on experience with ${area} will help you get the most from it.`}`, { chips: rest });
    if (kind === 'q:audience') return say(c.audience ? `**${c.name}** is designed for: ${c.audience}` : `**${c.name}** suits anyone working with ${area} who wants ${c.level === 'Foundational' ? 'a solid start' : c.level === 'Advanced' ? 'expert-level skills' : 'to go deeper'}.`, { chips: rest });
    if (kind === 'q:length') return say(`**${c.name}** runs for ${lengthLabel(c)}${c.delivery === 'ILT' || !c.delivery ? ', instructor-led' : `, ${c.delivery}`}. You can take it online, onsite or as a private session.`, { chips: rest });
    if (kind === 'q:level') return say(`**${c.name}** is a **${c.level}** course. ${c.level === 'Foundational' ? 'No prior experience with the product is needed.' : c.level === 'Intermediate' ? 'It\'s for people who have used the product and want to go further.' : 'It\'s for experienced practitioners who want expert-level depth.'}`, { chips: rest });
    if (kind === 'q:similar') {
      const list = similar(c, courses);
      if (!list.length) return say(`I couldn't find courses similar to **${c.name}** yet.`, { chips: rest });
      return showResults(list.map((x) => x.id), `Courses similar to **${c.name}**:`);
    }
  };

  const compare = async (a, b) => {
    if (!a || !b) return say('Tell me two course codes to compare, for example "compare HAZ-CG-ADM and HAZ-CG-ARB".', { chips: [['Help me choose', 'choose'], ['Start over', 'restart']] });
    await say(`Here's **${a.code}** next to **${b.code}**:`, { kind: 'compare', ids: [a.id, b.id], chips: [[`Get details: ${a.code}`, `details:${a.id}`], [`Get details: ${b.code}`, `details:${b.id}`], ['Start over', 'restart']] });
  };

  const faq = async (kind) => {
    const c = ctxRef.current.focus && course(ctxRef.current.focus);
    const base = [['Get details', 'details'], ['Help me choose', 'choose']];
    const counts = LEVELS.map((l) => (courses || []).filter((x) => x.level === l).length);
    const A = {
      pricing: c && c.price ? `**${c.name}** is listed at ${price(c.price)}. For team bookings, private sessions or onsite delivery, our team can send you a tailored quote.`
        : 'Prices depend on the course, how it\'s delivered (online, onsite or private) and how many people are joining. Tell me which course you\'re interested in, or tap **Get details** and our team will send you a quote.',
      delivery: 'Every course is instructor-led, and you can take it three ways: **online** in a live virtual classroom, **onsite** at your office, or as a **private** session just for your team.',
      certificate: `${c && c.certification ? `**${c.name}** helps you prepare for: ${c.certification}. ` : ''}Every course gives you a Hazdemy certificate of completion once you finish all its lessons and leave a review.`,
      tailored: 'Yes, we can tailor training for your team. We adjust the content, examples, schedule and labs to your projects and environment. Tap **Get details** and tell us about your team.',
      mentorship: 'We offer mentorship after a course: follow-up sessions with an expert instructor to help you apply what you learned to your own projects. Tap **Get details** to ask about options.',
      labs: c && c.labs ? `For **${c.name}**: ${c.labs}` : 'Most technical courses include hands-on labs in a ready-made environment, so you can practise without installing anything yourself.',
      contact: 'You can reach our team by tapping **Get details** (I\'ll fill in the form for you), by opening the contact page, or by emailing support@hazdemy.com.',
      levels: `Courses come in three levels: **Foundational** for people new to a product (${counts[0]} courses), **Intermediate** for people who've used it and want to go deeper (${counts[1]}), and **Advanced** for expert topics (${counts[2]}).`
    };
    if (kind === 'soon') {
      const list = (courses || []).filter((x) => !x.published).sort((x, y) => x.name.localeCompare(y.name));
      return list.length ? showResults(list.map((x) => x.id), `We have **${list.length} courses coming soon**. Here are a few:`) : say('There are no new courses announced right now.', { chips: base });
    }
    if (kind === 'areas') return act('areas');
    return say(A[kind], { chips: kind === 'contact' ? [['Open contact', 'nav:contact'], ['Get details', 'details']] : base });
  };

  const find = async (raw) => {
    const qy = parse(raw, courses, vocab);
    if (qy.codes.length === 1) {
      const c = findCourse(qy.codes[0], courses);
      if (c) return act(`pick:${c.id}`);
      return say(`I couldn't find an open or upcoming course with the code **${qy.codes[0]}**. It may have been retired. Try a name or topic instead:`, { chips: OPENING });
    }
    const { results, relaxed } = search(qy, courses);
    const fixed = qy.fixes.length ? ` (I read ${qy.fixes.map(([a, b]) => `“${a}” as **${b}**`).join(', ')})` : '';
    if (!results.length) {
      const near = qy.areaHint && courses.filter((c) => areaOf(c) === qy.areaHint).sort((x, y) => (y.published - x.published) || LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level));
      if (near && near.length) return showResults(near.map((c) => c.id), `I couldn't find a course for “${raw}” right now${fixed}, but here are our **${qy.areaHint}** courses:`);
      const sug = suggestions(raw, vocab);
      if (sug.length) return say(`I couldn't find anything for “${raw}”. Did you mean…?`, { chips: [...sug.map((s) => [s, `search:${s}`]), ['Browse all areas', 'areas']] });
      return say(`I couldn't find a match for “${raw}”. Try a product name like DataStage or Guardium, or pick an area:`, { chips: AREAS.map((a) => [a, `browse:${a}`]) });
    }
    const what = [qy.products.join(', ') || qy.keywords.slice(0, 3).join(' '), qy.area, qy.level, qy.maxDays ? `under ${qy.maxDays < 1 ? `${Math.round(qy.maxDays * 8)} hours` : `${qy.maxDays} day${qy.maxDays === 1 ? '' : 's'}`}` : ''].filter(Boolean).join(' · ');
    const note = relaxed === 'level' ? ' None matched that level exactly, so these are the closest.' : relaxed === 'duration' ? ' None were that short, so these are the closest.' : '';
    return showResults(results.map((c) => c.id), `I found **${results.length} course${results.length === 1 ? '' : 's'}**${what ? ` for ${what}` : ''}${fixed}.${note}`);
  };

  /** Runs a button action or a recognised intent. */
  const act = async (a) => {
    const [k, v] = [a.split(':')[0], a.slice(a.indexOf(':') + 1)];
    const r = ctxRef.current.results;
    if (a === 'restart') { setMsgs([]); setCtx({ ...EMPTY }); return greet(); }
    if (a === 'choose') { setCtx({ flow: { step: 'role' } }); return say('Let\'s find the right path for you. Three quick questions. First, what\'s your role?', { chips: ROLES.map(([key, l]) => [l, `role:${key}`]) }); }
    if (k === 'role') { setCtx({ flow: { step: 'area', role: v } }); return say('Which technology area are you interested in?', { chips: [...AREAS.map((x) => [x, `area:${x}`]), ['Any area', 'area:Any']] }); }
    if (k === 'area') { setCtx({ flow: { ...ctxRef.current.flow, step: 'exp', area: v } }); return say(`${v === 'Any' ? 'Any area, got it.' : `${v}, good choice.`} How much experience do you have with it?`, { chips: EXPERIENCE.map(([l, label]) => [label, `exp:${l}`]) }); }
    if (k === 'exp') {
      const f = { ...ctxRef.current.flow, level: v };
      setCtx({ flow: null });
      const path = learningPath(courses, f);
      const interest = f.area === 'Infrastructure' ? 'IT Infrastructure' : f.area;
      api.post(q('/api/learn/recommend'), { interests: f.area === 'Any' ? [] : [interest], level: { Foundational: 'Beginner', Intermediate: 'Intermediate', Advanced: 'Advanced' }[v], save: true }).catch(() => {});
      if (!path.length) return say('I couldn\'t find courses for that combination yet. Try another area, or ask our team.', { chips: [['Browse all areas', 'areas'], ['Get details', 'details'], ['Start over', 'restart']] });
      const role = ROLES.find(([key]) => key === f.role)?.[1];
      return showResults(path.map((c) => c.id), `Here's a suggested learning path${role && f.role !== 'any' ? ` for a **${role.toLowerCase()}**` : ''}${f.area !== 'Any' ? ` in **${f.area}**` : ''}, starting at **${v}** level and building up:`, path.map((c, i) => `Step ${i + 1} · ${c.level}`));
    }
    if (a === 'areas') return say('Here are our course areas. Pick one to see its courses:', { chips: AREAS.map((x) => [`${x} (${courses.filter((c) => areaOf(c) === x).length})`, `browse:${x}`]) });
    if (k === 'browse') {
      const list = courses.filter((c) => areaOf(c) === v).sort((x, y) => (y.published - x.published) || LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level) || (y.rating || 0) - (x.rating || 0));
      return list.length ? showResults(list.map((c) => c.id), `There are **${list.length} courses** in ${v}. Here are the first ${Math.min(PAGE, list.length)}:`) : say(`There are no courses in ${v} yet.`, { chips: OPENING });
    }
    if (a === 'short') {
      const list = courses.filter((c) => daysOf(c) && daysOf(c) <= 1).sort((x, y) => daysOf(x) - daysOf(y));
      return list.length ? showResults(list.map((c) => c.id), `Here are our short courses, **one day or less** (${list.length} in total):`) : say('There are no short courses right now.', { chips: OPENING });
    }
    if (a === 'more' && r) {
      const next = r.ids.slice(r.shown, r.shown + PAGE);
      if (!next.length) return say('That\'s all of them.', { chips: resultChips(r) });
      const nr = { ...r, shown: r.shown + next.length };
      setCtx({ results: nr });
      return say(`Here ${next.length === 1 ? 'is 1 more' : `are ${next.length} more`}:`, { kind: 'cards', ids: next, steps: r.steps ? r.steps.slice(r.shown, r.shown + PAGE) : null, chips: resultChips(nr) });
    }
    if (a === 'rated' || a === 'popular') {
      const key = a === 'rated' ? (c) => [c.rating ?? -1, c.learners || 0] : (c) => [c.learners || 0, c.rating ?? -1];
      const by = (x, y) => { const [a1, a2] = key(course(x)), [b1, b2] = key(course(y)); return b1 - a1 || b2 - a2; };
      const ids = (r ? [...r.ids] : courses.filter((c) => c.published).map((c) => c.id)).sort(by);
      const scored = ids.filter((id) => (a === 'rated' ? course(id).rating != null : course(id).learners > 0)).length;
      const none = scored ? '' : a === 'rated' ? ' None of these have learner reviews yet, so the order may change as reviews come in.' : ' None of these have enrolments yet, so the order may change.';
      if (r) return showResults(ids, `Here they are, ${a === 'rated' ? 'highest rated' : 'most popular'} first.${none}`);
      return showResults(ids, `${a === 'rated' ? 'Here are our **highest-rated courses**, based on learner reviews.' : 'Here are our **most popular courses**, based on how many learners have enrolled.'}${none}`);
    }
    if (a === 'shortest' && r) {
      const ids = [...r.ids].sort((x, y) => (daysOf(course(x)) || 99) - (daysOf(course(y)) || 99));
      return showResults(ids, 'Here they are, shortest first:');
    }
    if (a === 'compare2' && r) return compare(course(r.ids[0]), course(r.ids[1]));
    if (k === 'pick') {
      const c = course(v);
      if (!c) return say('I couldn\'t find that course.');
      setCtx({ focus: c.id });
      return say(`Here are the details for **${c.name}**. What would you like to know?`, { kind: 'details', ids: [c.id], chips: FOLLOW });
    }
    if (k === 'q') {
      const c = ctxRef.current.focus && course(ctxRef.current.focus);
      return c ? answerAbout(a, c) : say('Which course do you mean? Type its name or code, like HAZ-AT-008.');
    }
    if (a === 'details') return handover(ctxRef.current.focus);
    if (k === 'details') return handover(v);
    if (k === 'search') return find(v);
    if (k === 'nav') { const [path, label] = PAGES[v] || PAGES.explore; await say(`Opening ${label}…`); return nav(q(path)); }
    if (k === 'faq') return faq(v);
    return greet();
  };

  const run = useCallback(async (fn) => {
    if (busy.current) return;
    busy.current = true;
    try { await fn(); } finally { busy.current = false; }
  }, []);

  const tap = (label, a) => run(async () => { me(label); await act(a); });
  const send = (raw) => {
    const body = raw.trim();
    if (!body || !courses) return;
    setText('');
    run(async () => {
      me(body);
      const focus = ctxRef.current.focus;
      const it = intent(body, focus);
      if (it === 'rated' || it === 'popular') { setCtx({ results: null }); return act(it); }
      if (it === 'restart' || it === 'choose' || it === 'more' || it === 'shortest' || it === 'details' || it.startsWith('nav:') || it.startsWith('q:') || it.startsWith('faq:')) {
        if ((it === 'more' || it === 'shortest') && !ctxRef.current.results) return find(body);
        return act(it);
      }
      if (it === 'compare') {
        const codes = [...body.matchAll(/\bhaz-[a-z]{2}-[a-z0-9]+\b/gi)].map((m) => findCourse(m[0], courses)).filter(Boolean);
        const r = ctxRef.current.results;
        if (codes.length >= 2) return compare(codes[0], codes[1]);
        if (r && r.ids.length >= 2) return compare(course(r.ids[0]), course(r.ids[1]));
        return compare(null, null);
      }
      if (it === 'hello') return say('Hello! What can I help you find today?', { chips: OPENING });
      if (it === 'thanks') return say('You\'re welcome! Anything else I can help with?', { chips: OPENING });
      const f = ctxRef.current.flow;
      if (f) setCtx({ flow: null });
      const c = findCourse(body, courses);
      if (c) return act(`pick:${c.id}`);
      return find(body);
    });
  };

  /* ?act=choose from "Let us help you to choose": run it once, then drop it from the address */
  useEffect(() => {
    const a = params.get('act');
    if (!a) return;
    setPending(a);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('act'); return n; }, { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !courses || busy.current) return;
    if (pending) { const a = pending; setPending(null); run(async () => { const label = OPENING.find(([, x]) => x === a)?.[0]; if (label) me(label); await act(a); }); return; }
    if (!msgs.length) { run(greet); return; }
    if (pageCourse && pageCourse !== ctxRef.current.seen && course(pageCourse)) {
      const c = course(pageCourse);
      setCtx({ focus: c.id, seen: c.id });
      run(() => say(`I see you're now looking at **${c.code} · ${c.name}**. Anything you'd like to know about it?`, { chips: [['Prerequisites?', 'q:prereqs'], ['Who should attend?', 'q:audience'], ['Similar courses', 'q:similar'], ['Get details', 'details']] }));
    }
  }, [open, courses, pending, pageCourse]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 50); }, [open]);

  const listen = () => {
    if (!Speech) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Speech();
    r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(' '); setText(t); if (e.results[e.results.length - 1].isFinal) final = t; };
    r.onend = () => { setListening(false); if (final.trim()) send(final); };
    r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };

  const last = [...msgs].reverse().find((m) => m.from === 'bot');
  const chips = !typing && last?.chips && msgs[msgs.length - 1] === last ? last.chips : null;

  return (
    <>
      <section className="t-head"><div><h1>Hazdemy Course Advisor</h1><p>Ask about any course, get a learning path, or let our team send you the details.</p></div><button className="btn" onClick={() => run(() => act('restart'))}><Icon name="reset" small />Start over</button></section>
      {(
        <section className="adv" aria-label="Hazdemy course advisor">
          <div className="adv-log" ref={log} role="log" aria-live="polite">
            {!courses && <p className="note" style={{ textAlign: 'center' }}>Loading courses…</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`adv-m ${m.from}`}>
                <div className="adv-b">
                  <p>{m.from === 'bot' ? rich(m.text) : m.text}</p>
                  {m.text === (m.full ?? m.text) && m.kind === 'cards' && <div className="adv-cards">{m.ids.map((id, i) => course(id) && <CourseCard key={id} c={course(id)} step={m.steps?.[i]} q={q} nav={nav} onAct={(label, a) => tap(label, a)} />)}</div>}
                  {m.text === (m.full ?? m.text) && m.kind === 'details' && course(m.ids[0]) && <Details c={course(m.ids[0])} price={price} q={q} nav={nav} onAct={(label, a) => tap(label, a)} />}
                  {m.text === (m.full ?? m.text) && m.kind === 'compare' && course(m.ids[0]) && course(m.ids[1]) && <Compare a={course(m.ids[0])} b={course(m.ids[1])} />}
                </div>
              </div>
            ))}
            {typing && <div className="adv-m bot"><div className="adv-b adv-dots" aria-label="The advisor is typing"><i /><i /><i /></div></div>}
            {chips && <div className="adv-chips">{chips.map(([label, a]) => <button key={a} type="button" onClick={() => tap(label, a)}>{label}</button>)}</div>}
          </div>
          <form className="adv-in" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label className="sr" htmlFor="adv-in">Ask Hazdemy</label>
            <input id="adv-in" ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? 'Listening…' : 'Ask about a course, e.g. DataStage for beginners'} autoComplete="off" disabled={!courses} />
            {Speech && <button type="button" className={`icon-btn${listening ? ' on' : ''}`} onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak your question'} title={listening ? 'Stop listening' : 'Speak your question'} aria-pressed={listening}>🎤</button>}
            <button className="btn primary" type="submit" disabled={!text.trim() || !courses} aria-label="Send"><Icon name="send" small /></button>
          </form>
        </section>
      )}
    </>
  );
}

const thumb = (c) => ({ ...c, platform: c.area });

function CourseCard({ c, step, q, nav, onAct }) {
  return (
    <article className="adv-card">
      {step && <span className="adv-step">{step}</span>}
      <div className="adv-ch"><CourseThumb course={thumb(c)} /><span className="tx"><b>{c.name}</b><span className="note">{c.code} · {c.level} · {lengthLabel(c)}{c.rating != null ? ` · ★ ${c.rating.toFixed(1)}` : ''}{c.learners ? ` · ${c.learners} learner${c.learners === 1 ? '' : 's'}` : ''}</span></span></div>
      {!c.published && <span className="pill warn">Coming soon</span>}
      <div className="adv-ca">
        <button type="button" className="btn sm" onClick={() => onAct(`Details: ${c.code}`, `pick:${c.id}`)}>Details</button>
        <button type="button" className="btn sm" disabled={!c.published} title={c.published ? '' : 'This course isn’t open for enrolment yet'} onClick={() => nav(q('/learn/courses/' + c.id))}>Open page</button>
        <button type="button" className="btn sm primary" onClick={() => onAct(`Ask for details: ${c.code}`, `details:${c.id}`)}>Ask for details</button>
      </div>
    </article>
  );
}

function Details({ c, price, q, nav, onAct }) {
  const rows = [['Code', c.code], ['Area', areaOf(c)], ['Product', c.product || '—'], ['Level', c.level], ['Length', lengthLabel(c)], c.rating != null && ['Rating', `★ ${c.rating.toFixed(1)}`], c.learners > 0 && ['Learners', String(c.learners)], ['Delivery', 'Instructor-led: online, onsite or private'], c.price && ['Price', price(c.price)], ['Status', c.published ? 'Open for enrolment' : 'Coming soon']].filter(Boolean);
  return (
    <div className="adv-card">
      <div className="adv-ch"><CourseThumb course={thumb(c)} /><span className="tx"><b>{c.name}</b></span></div>
      <dl className="adv-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="adv-ca">
        <button type="button" className="btn sm" disabled={!c.published} onClick={() => nav(q('/learn/courses/' + c.id))}>Open page</button>
        <button type="button" className="btn sm primary" onClick={() => onAct('Get details', `details:${c.id}`)}>Ask for details</button>
      </div>
    </div>
  );
}

function Compare({ a, b }) {
  const rows = [['Duration', lengthLabel], ['Level', (c) => c.level], ['Product', (c) => c.product || '—'], ['Area', areaOf], ['Prerequisites', (c) => c.prereqs || 'None listed']];
  return (
    <div className="adv-cmp" role="table" aria-label="Course comparison">
      <div role="row" className="hd"><span role="columnheader" /><b role="columnheader">{a.code}</b><b role="columnheader">{b.code}</b></div>
      <div role="row"><span role="rowheader">Course</span><span role="cell">{a.name}</span><span role="cell">{b.name}</span></div>
      {rows.map(([k, f]) => <div role="row" key={k}><span role="rowheader">{k}</span><span role="cell">{f(a)}</span><span role="cell">{f(b)}</span></div>)}
    </div>
  );
}
