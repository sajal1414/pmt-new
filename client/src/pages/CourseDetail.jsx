import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Confirm, Dialog, Feedback, Field, StatusPill } from '../components/ui.jsx';
import OutlineDialog from '../components/OutlineDialog.jsx';
import CoursePdfDialog from '../components/CoursePdfDialog.jsx';
import InstructorAccounts from '../components/InstructorAccounts.jsx';
import RaterList from '../components/RaterList.jsx';
import ScheduleEditor from '../components/ScheduleEditor.jsx';
import { NextBatchBar } from '../components/BatchList.jsx';
import { CustomVersionDialog, CustomVersions } from '../components/CustomVersion.jsx';
import { InstructorForm } from './Instructors.jsx';
import RichText, { RichView } from '../components/RichText.jsx';
import { isHtml } from '../lib/richtext.js';
import { useAuth } from '../lib/auth.jsx';
import { useCustomFields } from '../lib/customFields.js';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { STATUSES, OUTLINE, SKILLS, LABLOC, IPOWN, splitList, isURL, fmtDur, fmtMins } from '../lib/constants.js';

const SECTIONS = [
  { t: 'Core Identification & Hierarchy', i: 'layers', g: 'g3', f: [{ k: 'name', l: 'Course name', req: 1, w: 'w2' }, { k: 'status', l: 'Status', type: 'select', o: STATUSES, req: 1 }, { k: 'code', l: 'Course code', req: 1 }, { k: 'ibmCode', l: 'IBM course codes', ph: 'e.g. 6X101G, W701G' }, { k: 'pmt', l: 'On IBM PMT', ph: 'e.g. Yes / No / Planned' }, { k: 'vendor', l: 'Vendor' }, { k: 'platform', l: 'Platform' }, { k: 'portfolio', l: 'Portfolio' }, { k: 'product', l: 'Product' }, { k: 'customFor', l: 'Custom version for (client)', ph: 'Leave empty for a standard course' }] },
  { t: 'Assigned Instructors & Faculty', i: 'people', picker: true },
  { t: 'Modality, Duration & Outline Tracking', i: 'cal', g: 'g4', f: [{ k: 'delivery', l: 'Modality', ph: 'ILT' }, { k: 'duration', l: 'Duration (days)', type: 'number', step: '0.05' }, { k: 'hours', l: 'Number of hours', type: 'number', step: '0.5' }, { k: 'outlineStatus', l: 'Course outline status', type: 'select', o: OUTLINE }, { k: 'outline', l: 'Link to course outline', w: 'wf', ph: 'https://… or document name' }] },
  { t: 'Course Topics & Objectives', i: 'list', g: 'g2', upload: true, f: [{ k: 'topics', l: 'Course topics', type: 'rich', ph: 'Add the topics covered, or upload a Word outline…' }, { k: 'objectives', l: 'Learning objectives', type: 'rich', ph: 'What learners will be able to do…' }] },
  { t: 'Curriculum, Audience & Lab Specifications', i: 'book', g: 'g3', f: [{ k: 'description', l: 'Course description', type: 'textarea', w: 'wf' },{ k: 'skill', l: 'Skill level', type: 'select', o: SKILLS }, { k: 'maxStudents', l: 'Max students', type: 'number', step: '1' }, { k: 'labConfig', l: 'Lab configuration' }, { k: 'prereqs', l: 'Pre reqs', type: 'textarea' }, { k: 'persona', l: 'Persona', type: 'textarea' }, { k: 'deliveryNotes', l: 'Delivery instruction notes', type: 'textarea' }] },
  { t: 'Operations, Schedule & Ownership', i: 'clock', g: 'g4', f: [{ k: 'labLocation', l: 'Lab location (ITZ, Hazdemy, Instructor owned, N/A)', type: 'select', o: LABLOC, w: 'w2' }, { k: 'ipOwner', l: 'IP owner (Hazdemy, SubK)', type: 'select', o: IPOWN }, { k: 'author', l: 'Course author (name or email)' }, { k: 'planned', l: 'Planned completion date', type: 'date' }, { k: 'release', l: 'Release date', type: 'date' }, { k: 'retire', l: 'Retire date', type: 'date' }, { k: 'ibmRetire', l: 'IBM retirement date', type: 'date' }] },
  { t: 'Financials, Credentials & Metadata', i: 'badge', g: 'g4', f: [{ k: 'dailyRate', l: 'Instructor daily rate' }, { k: 'materialsCost', l: 'Materials cost' }, { k: 'labCost', l: 'Lab cost' }, { k: 'learningPath', l: 'Learning path' }, { k: 'badge', l: 'Badge' }, { k: 'certification', l: 'Certification' }, { k: 'recordSource', l: 'Record source', w: 'w2' }, { k: 'notes', l: 'Notes', type: 'textarea', w: 'wf' }] }
];

function InstructorPicker({ value, onChange }) {
  const { instructors } = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('all');
  const [adding, setAdding] = useState(null); // preset for the "New instructor" form
  const box = useRef(null);
  useEffect(() => {
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, []);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return instructors.filter((i) => {
      if (!s) return true;
      const name = i.name.toLowerCase(), skill = `${i.skills} ${i.canTeach}`.toLowerCase(), prod = `${i.product} ${(i.platforms || []).join(' ')}`.toLowerCase();
      return mode === 'name' ? name.includes(s) : mode === 'skill' ? skill.includes(s) : mode === 'product' ? prod.includes(s) : name.includes(s) || skill.includes(s) || prod.includes(s) || i.email.toLowerCase().includes(s);
    });
  }, [instructors, q, mode]);
  const toggle = (n) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  const known = (n) => instructors.find((i) => i.name.toLowerCase() === n.toLowerCase());
  return (
    <>
      <div className="assigned">
        {value.length ? value.map((n) => (
          <span key={n} className={`ichip${known(n) ? '' : ' ext'}`} title={known(n)?.email || 'Not in the instructor repository'}>{n}
            <button type="button" onClick={() => toggle(n)} aria-label={'Remove ' + n}><Icon name="x" small /></button></span>
        )) : <span className="note">No instructors assigned yet.</span>}
      </div>
      <div className="pick-head"><p className="note" style={{ margin: 0 }}>Search and link instructors by name, skill, or product.</p>
        <button type="button" className="btn sm" onClick={() => setAdding({})}><Icon name="plus" small />Add instructor</button></div>
      <div className="picker" ref={box}>
        <label className="pick-in" htmlFor="pickQ"><Icon name="search" small /><span className="sr">Add or change instructors</span>
          <input id="pickQ" placeholder="Search by instructor name, skill, or product…" autoComplete="off" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          <button type="button" className="linkbtn" onClick={() => { setQ(''); setOpen(true); }}>Clear</button>
        </label>
        {open && (
          <div className="pick-pop">
            <div className="pick-bar">Match {[['all', 'All'], ['name', 'Name'], ['skill', 'Skill'], ['product', 'Product']].map(([m, l]) => <button key={m} type="button" className="seg" aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}</div>
            <div className="pick-list">
              {matches.length ? matches.map((i) => {
                const sk = splitList(i.skills);
                return (
                  <label key={i.id} htmlFor={'pk-' + i.id}>
                    <input type="checkbox" id={'pk-' + i.id} checked={value.includes(i.name)} onChange={() => toggle(i.name)} />
                    <span className="who2"><b>{i.name}</b><span>{i.email}{i.location && ` • ${i.location}`}</span>
                      <span className="chips">{sk.slice(0, 3).map((s) => <span key={s} className="tag">{s}</span>)}{sk.length > 3 && <span className="note">+{sk.length - 3} more</span>}</span></span>
                    {i.product && <span className="tag">{i.product}</span>}
                  </label>
                );
              }) : <p className="note" style={{ padding: 14, margin: 0 }}>No instructors match “{q}”.</p>}
            </div>
            <div className="pick-foot"><span>{value.length} instructor{value.length === 1 ? '' : 's'} selected</span>
              <button type="button" className="btn sm" onClick={() => { setOpen(false); setAdding(q.trim() && !q.includes('@') ? { name: q.trim() } : q.includes('@') ? { email: q.trim() } : {}); }}><Icon name="plus" small />{q.trim() && !matches.length ? `Add “${q.trim()}” as new` : 'New instructor'}</button>
              <button type="button" className="btn sm primary" onClick={() => setOpen(false)}>Done</button></div>
          </div>
        )}
      </div>
      <InstructorForm open={!!adding} preset={adding || {}} onClose={() => setAdding(null)}
        onSaved={(x) => { if (x?.name && !value.includes(x.name)) onChange([...value, x.name]); setQ(''); }} />
    </>
  );
}

const BULLET = /^\s*[•\-*]\s*/;
const EXERCISE = /^(exercise|lab|hands[- ]on(?: lab)?|activity|practical|workshop)\s*(\d+[a-z]?)?\s*[:.\-–—]\s*(.*)$/i;
const EX_DETAIL = /^(objective|goal|task|outcome|deliverable|scenario|steps?|duration)s?\s*[:\-–—]\s*(.*)$/i;

/** Lesson notes -> parts: { kind: 'head' | 'point' | 'exercise', ... }. An exercise collects the "Objective: …" lines after it. */
function noteParts(text) {
  const parts = [];
  for (const raw of String(text || '').split('\n')) {
    if (!raw.trim()) continue;
    const t = raw.replace(BULLET, '').trim(), last = parts[parts.length - 1];
    const ex = t.match(EXERCISE), det = t.match(EX_DETAIL);
    if (ex) parts.push({ kind: 'exercise', label: `${ex[1][0].toUpperCase()}${ex[1].slice(1).toLowerCase()}${ex[2] ? ' ' + ex[2] : ''}`, title: ex[3], details: [] });
    else if (last?.kind === 'exercise' && (det || /^\s{2,}/.test(raw))) last.details.push(det ? { label: det[1][0].toUpperCase() + det[1].slice(1).toLowerCase(), text: det[2] } : { text: t });
    else if (!BULLET.test(raw)) parts.push({ kind: 'head', text: t });
    else parts.push({ kind: 'point', text: t, sub: /^\s{2,}/.test(raw) });
  }
  return parts;
}
const noteCounts = (text) => { const p = noteParts(text); return { points: p.filter((x) => x.kind === 'point').length, exercises: p.filter((x) => x.kind === 'exercise').length }; };

/**
 * Lesson notes: plain lines become bold sub-headings (e.g. "Unit 1: …" inside a day), "•" lines become bullets,
 * and "Exercise N: …" with its "Objective: …" becomes a highlighted exercise box. `compact` shows just the sub-headings.
 */
export function LessonNotes({ text, compact }) {
  const parts = noteParts(text);
  if (compact) {
    const heads = parts.filter((p) => p.kind === 'head');
    if (heads.length) return <ul className="ln compact">{heads.map((h, i) => <li key={i} className="h">{h.text}</li>)}</ul>;
    const pts = parts.filter((p) => p.kind === 'point').slice(0, 3).map((p) => p.text);
    return <p className="note" style={{ margin: 0 }}>{pts.join(' · ')}{parts.length > 3 ? ' …' : ''}</p>;
  }
  return (
    <ul className="ln">{parts.map((p, i) => p.kind === 'exercise' ? (
      <li key={i} className="ex">
        <div className="ex-h"><span className="ex-tag"><Icon name="chip" small />{p.label}</span><b>{p.title}</b></div>
        {p.details.map((d, k) => <p key={k} className="ex-d">{d.label && <b>{d.label}: </b>}{d.text}</p>)}
      </li>
    ) : <li key={i} className={p.kind === 'head' ? 'h' : p.sub ? 'b sub' : 'b'}>{p.text}</li>)}</ul>
  );
}

/** A unit's questions and answers; each answer opens when its question is clicked. */
export function LessonQA({ items, title = 'Questions & answers' }) {
  if (!items?.length) return null;
  return (
    <div className="qa">
      <h4><Icon name="msg" small />{title} <span className="note">({items.length})</span></h4>
      {items.map((x, i) => (
        <details key={x.id || i} className="qa-item">
          <summary><span className="qa-q">Q{i + 1}</span>{x.q}</summary>
          <div className="qa-a">{x.a ? x.a.split('\n').map((line, k) => <p key={k}>{line}</p>) : <p className="note">No answer added yet.</p>}</div>
        </details>
      ))}
    </div>
  );
}

/** Edit a unit's questions and answers (inside the Edit lesson window). */
function QAEditor({ items, onChange }) {
  const list = items || [];
  const set = (i, k, v) => onChange(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i, d) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; onChange(l); };
  return (
    <fieldset className="qa-edit full">
      <legend>Questions &amp; answers <span className="note">({list.length})</span></legend>
      <p className="note" style={{ margin: 0 }}>Learners see these under the lesson; each answer opens when they click its question. Leave a question empty to remove it.</p>
      {list.map((x, i) => (
        <div key={x.id} className="qa-row">
          <span className="qa-q">Q{i + 1}</span>
          <div className="qa-fields">
            <label className="sr" htmlFor={'qa-q-' + x.id}>Question {i + 1}</label>
            <input id={'qa-q-' + x.id} placeholder="Question" value={x.q} onChange={(e) => set(i, 'q', e.target.value)} />
            <label className="sr" htmlFor={'qa-a-' + x.id}>Answer {i + 1}</label>
            <textarea id={'qa-a-' + x.id} rows={2} placeholder="Answer" value={x.a} onChange={(e) => set(i, 'a', e.target.value)} />
          </div>
          <div className="rowact">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move question up" title="Move up"><Icon name="up" small /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move question down" title="Move down"><Icon name="down" small /></button>
            <button type="button" className="del" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={'Delete question ' + (i + 1)} title="Delete"><Icon name="trash" small /></button>
          </div>
        </div>
      ))}
      <div><button type="button" className="btn sm" onClick={() => onChange([...list, { id: 'new-' + Date.now(), q: '', a: '' }])} disabled={list.length >= 50}><Icon name="plus" small />Add question</button></div>
    </fieldset>
  );
}

/** Consecutive lessons that share a day form one group: [{ day, items: [{ l, i }] }] */
const groupByDay = (lessons) => lessons.reduce((g, l, i) => {
  const day = l.day || '', last = g[g.length - 1];
  if (last && last.day === day) last.items.push({ l, i }); else g.push({ day, items: [{ l, i }] });
  return g;
}, []);
const splitDay = (d) => { const m = d.match(/^(day\s*\d+)\s*[:\-–—]?\s*(.*)$/i); return m ? [m[1], m[2]] : ['', d]; };
const sumMins = (items) => items.reduce((a, { l }) => a + (+l.mins || 0), 0);

function Lessons({ lessons, onChange }) {
  const [title, setTitle] = useState('');
  const [mins, setMins] = useState('');
  const days = useMemo(() => [...new Set(lessons.map((l) => l.day || '').filter(Boolean))], [lessons]);
  const [newDay, setNewDay] = useState(null); // null = follow the last lesson's day
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null); // { i, draft }
  const [del, setDel] = useState(null);
  const [closedDays, setClosedDays] = useState(() => new Set());
  const [openLessons, setOpenLessons] = useState(() => new Set());
  const total = lessons.reduce((a, l) => a + (+l.mins || 0), 0);
  const groups = groupByDay(lessons);
  const flip = (setter, key) => setter((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  // moving past the edge of a day moves the lesson into the neighbouring day instead of swapping
  const move = (i, d) => {
    const l = [...lessons], j = i + d;
    if ((l[j].day || '') !== (l[i].day || '')) l[i] = { ...l[i], day: l[j].day || '' }; else [l[i], l[j]] = [l[j], l[i]];
    onChange(l);
  };
  const dayForNew = newDay ?? (lessons[lessons.length - 1]?.day || '');
  const add = (e) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Enter a lesson title.'); return; }
    const lesson = { id: 'new-' + Date.now(), day: dayForNew, title: title.trim(), mins: mins === '' ? '' : Math.max(0, +mins), video: '', attachment: '', article: '' };
    const lastOfDay = lessons.map((l) => l.day || '').lastIndexOf(dayForNew);
    const next = [...lessons];
    next.splice(lastOfDay < 0 ? next.length : lastOfDay + 1, 0, lesson); // keep it inside its day
    onChange(next);
    setTitle(''); setMins(''); setErr('');
  };
  const link = (url, label) => (isURL(url) ? <a href={url} target="_blank" rel="noopener noreferrer">{label}</a> : url);
  const allOpen = groups.every((g) => !closedDays.has(g.day)) && lessons.every((l) => openLessons.has(l.id));
  const toggleAll = () => {
    if (allOpen) { setOpenLessons(new Set()); setClosedDays(new Set(groups.map((g) => g.day))); }
    else { setOpenLessons(new Set(lessons.map((l) => l.id))); setClosedDays(new Set()); }
  };

  const lessonItem = ({ l, i }) => {
    const open = openLessons.has(l.id), { points: notes, exercises } = noteCounts(l.article);
    return (
      <article key={l.id} className={`acc-lesson${open ? ' open' : ''}`}>
        <div className="acc-lh">
          <button className="acc-toggle" onClick={() => flip(setOpenLessons, l.id)} aria-expanded={open}>
            <Icon name="right" small className="chev" />
            <span className="no">{i + 1}</span>
            <span className="tt"><b>{l.title}</b>
              <span className="meta"><span><Icon name="clock" small />{fmtMins(l.mins)}</span>{notes > 0 && <span><Icon name="file" small />{notes} point{notes > 1 ? 's' : ''}</span>}{exercises > 0 && <span className="m-ex"><Icon name="chip" small />{exercises} exercise{exercises > 1 ? 's' : ''}</span>}{l.qa?.length > 0 && <span><Icon name="msg" small />{l.qa.length} Q&amp;A</span>}{l.video && <span><Icon name="video" small />Video</span>}{l.attachment && <span><Icon name="clip" small />Attachment</span>}</span>
            </span>
          </button>
          <div className="rowact">
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move lesson up" title="Move up"><Icon name="up" small /></button>
            <button onClick={() => move(i, 1)} disabled={i === lessons.length - 1} aria-label="Move lesson down" title="Move down"><Icon name="down" small /></button>
            <button onClick={() => setEdit({ i, draft: { day: '', ...l, qa: (l.qa || []).map((x) => ({ ...x })) } })} aria-label="Edit lesson" title="Edit"><Icon name="edit" small /></button>
            <button className="del" onClick={() => setDel(i)} aria-label="Delete lesson" title="Delete"><Icon name="trash" small /></button>
          </div>
        </div>
        {open && (
          <div className="acc-lb">
            {l.article ? <LessonNotes text={l.article} /> : <p className="note" style={{ margin: 0 }}>No notes for this lesson yet. Use Edit to add them.</p>}
            {(l.video || l.attachment) && <div className="acc-links">{l.video && <span><Icon name="video" small />{link(l.video, 'Watch video')}</span>}{l.attachment && <span><Icon name="clip" small />{link(l.attachment, 'Attachment')}</span>}</div>}
            <LessonQA items={l.qa} />
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="card">
      <form className="addrow" noValidate onSubmit={add}>
        <label className="sr" htmlFor="lTitle">New lesson or class title</label>
        <input className="t" id="lTitle" placeholder="New lesson / unit title…" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
        {days.length > 0 && (<>
          <label className="sr" htmlFor="lDay">Day</label>
          <select id="lDay" className="sel" value={dayForNew} onChange={(e) => setNewDay(e.target.value)}>
            {days.map((d) => <option key={d} value={d}>{splitDay(d)[0] || d}</option>)}<option value="">No day</option>
          </select>
        </>)}
        <label className="sr" htmlFor="lMins">Timeline in minutes</label>
        <input className="m" id="lMins" type="number" min="0" step="5" placeholder="Timeline (mins)" value={mins} onChange={(e) => setMins(e.target.value)} />
        <button className="btn primary" type="submit"><Icon name="plus" small />Add lesson</button>
      </form>
      <span className="err">{err}</span>
      {lessons.length ? (
        <>
          <div className="acc-bar">
            <div className="summary">{days.length > 0 && <span className="pill acc">{days.length} day{days.length > 1 ? 's' : ''}</span>}<span className="pill acc">{lessons.length} lesson{lessons.length > 1 ? 's' : ''}</span><span className="pill gone">{fmtMins(total)} total</span></div>
            <button className="linkbtn" onClick={toggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</button>
          </div>
          <div className="acc-list">{groups.map((g, gi) => {
            if (!g.day) return <div key={'nd' + gi} className="lessons">{g.items.map(lessonItem)}</div>;
            const open = !closedDays.has(g.day), [tag, name] = splitDay(g.day), m = sumMins(g.items);
            return (
              <section key={g.day + gi} className={`acc-day${open ? ' open' : ''}`}>
                <button className="acc-dh" onClick={() => flip(setClosedDays, g.day)} aria-expanded={open}>
                  <Icon name="right" small className="chev" />
                  {tag && <span className="dtag">{tag}</span>}
                  <b>{name || g.day}</b>
                  <span className="note">{g.items.length} lesson{g.items.length > 1 ? 's' : ''}{m ? ` · ${fmtMins(m)}` : ''}</span>
                </button>
                {open && <div className="lessons">{g.items.map(lessonItem)}</div>}
              </section>
            );
          })}</div>
        </>
      ) : <div className="empty"><b>No lessons defined for this course yet.</b><span>Add a lesson above, upload a Word outline, or import a Lessons sheet with Bulk import.</span></div>}
      <Dialog open={!!edit} wide title="Edit lesson" subtitle={edit ? `Lesson ${edit.i + 1} of ${lessons.length}` : ''} onClose={() => setEdit(null)}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" type="submit" form="lessonForm">Save lesson</button></>}>
        {edit && (
          <form id="lessonForm" className="form" noValidate onSubmit={(e) => { e.preventDefault(); if (!edit.draft.title.trim()) return; const l = [...lessons]; l[edit.i] = { ...edit.draft, day: String(edit.draft.day || '').trim(), mins: edit.draft.mins === '' ? '' : Math.max(0, +edit.draft.mins), qa: (edit.draft.qa || []).map((x) => ({ ...x, q: x.q.trim(), a: x.a.trim() })).filter((x) => x.q) }; onChange(l); setEdit(null); }}>
            {[['title', 'Lesson / unit title', 'text', 'full'], ['day', 'Day (groups lessons, e.g. “Day 1: Foundations”)', 'text', 'full'], ['mins', 'Timeline (mins)', 'number', ''], ['video', 'Video link', 'text', ''], ['attachment', 'Attachment link', 'text', 'full'], ['article', 'Notes (one point per line, start with •)', 'textarea', 'full']].map(([k, label, type, cls]) => (
              <Field key={k} id={'le-' + k} label={label} type={type} className={cls} required={k === 'title'} value={edit.draft[k]} error={k === 'title' && !edit.draft.title.trim() ? 'Lesson title is required.' : ''}
                onChange={(v) => setEdit((s) => ({ ...s, draft: { ...s.draft, [k]: v } }))} />
            ))}
            <QAEditor items={edit.draft.qa} onChange={(qa) => setEdit((s) => ({ ...s, draft: { ...s.draft, qa } }))} />
          </form>
        )}
      </Dialog>
      <Confirm open={del != null} title="Delete lesson?" message={del != null ? `“${lessons[del]?.title}” will be removed when you save the course.` : ''} confirmLabel="Delete lesson"
        onClose={() => setDel(null)} onConfirm={() => { onChange(lessons.filter((_, i) => i !== del)); setDel(null); }} />
    </section>
  );
}

function Syllabus({ c, onGoLessons }) {
  const ls = c.lessons || [];
  if (!ls.length && !c.topics) return <section className="card"><div className="empty"><Icon name="list" /><b>No lessons yet</b><span>Add some in the Curriculum &amp; Lessons tab.</span><button className="btn sm" onClick={onGoLessons}>Go to lessons</button></div></section>;
  const total = ls.reduce((a, l) => a + (+l.mins || 0), 0);
  const dayCount = new Set(ls.map((l) => l.day).filter(Boolean)).size;
  let run = 0;
  return (
    <section className="card"><div className="syl">
      <div><span className="code">{c.code}</span></div>
      <h2>{c.name}</h2>
      <div className="facts"><StatusPill status={c.status} />{c.delivery && <span className="pill gone">{c.delivery}</span>}{c.duration !== '' && <span className="pill gone">{fmtDur(c.duration)}{c.hours ? ` · ${c.hours} h` : ''}</span>}{c.skill && <span className="pill acc">{c.skill}</span>}{dayCount > 0 && <span className="pill gone">{dayCount} days</span>}<span className="pill gone">{ls.length} lessons · {fmtMins(total)}</span></div>
      {c.description && <p className="prose" style={{ margin: 0 }}>{c.description}</p>}
      {c.objectives && isHtml(c.objectives) && <div className="syl-obj"><h3>What you’ll learn</h3><RichView value={c.objectives} /></div>}
      {c.objectives && !isHtml(c.objectives) && <div className="syl-obj"><h3>What you’ll learn</h3><ul>{String(c.objectives).split('\n').map((o) => o.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean).map((o, i) => <li key={i}>{o}</li>)}</ul></div>}
      {(c.persona || c.prereqs) && <div className="tiles">{c.persona && <div className="tile"><span>Who it’s for</span><b style={{ fontWeight: 500, whiteSpace: 'pre-line' }}>{c.persona}</b></div>}{c.prereqs && <div className="tile"><span>Prerequisites</span><b style={{ fontWeight: 500, whiteSpace: 'pre-line' }}>{c.prereqs}</b></div>}</div>}
      {!ls.length && <div className="syl-topics"><h3>Course topics</h3><RichView value={c.topics} /></div>}
      {ls.length > 0 && groupByDay(ls).map((g, gi) => {
        const list = (
          <ol start={g.items[0].i + 1}>{g.items.map(({ l }) => {
            const begin = run; run += +l.mins || 0;
            return (
              <li key={l.id}><b>{l.title}</b><div className="tm">{fmtMins(l.mins)}{total ? ` · starts at ${begin ? fmtMins(begin) : '0 min'}` : ''}</div>
                {l.article && <div className="art"><LessonNotes text={l.article} /></div>}
                <LessonQA items={l.qa} />
                {(l.video || l.attachment) && <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 13 }}>
                  {l.video && (isURL(l.video) ? <a href={l.video} target="_blank" rel="noopener noreferrer"><Icon name="video" small /> Watch video</a> : <span>{l.video}</span>)}
                  {l.attachment && (isURL(l.attachment) ? <a href={l.attachment} target="_blank" rel="noopener noreferrer"><Icon name="clip" small /> Attachment</a> : <span>{l.attachment}</span>)}
                </div>}
              </li>
            );
          })}</ol>
        );
        if (!g.day) return <div key={'nd' + gi}>{list}</div>;
        const [tag, name] = splitDay(g.day);
        return <div key={g.day + gi} className="syl-day"><h3>{tag && <span className="dtag">{tag}</span>}{name || g.day}</h3>{list}</div>;
      })}
    </div></section>
  );
}

/** Learner reviews of this course, read live from the ratings feed. */
function Reviews({ id, r }) {
  if (!r) return <section className="card"><div className="empty"><Icon name="star" /><b>No learner reviews yet</b><span>Ratings show here as soon as a learner reviews this course.</span></div></section>;
  return (
    <section className="card crev">
      <div className="crev-sum">
        <div className="crev-avg"><b>{r.avg.toFixed(1)}</b><Feedback rating={r.avg} /><span className="note">{r.count} review{r.count === 1 ? '' : 's'}</span></div>
        <ul className="crev-bars">{r.stars.map((n, i) => (
          <li key={i}><span>{5 - i} star</span><span className="crev-track"><span style={{ width: (n / r.count) * 100 + '%' }} /></span><span className="num">{n}</span></li>
        ))}</ul>
      </div>
      <h3 className="crev-h3">Who rated this course</h3>
      <RaterList by={{ course: id }} />
    </section>
  );
}

/** An empty course with every field of the form, for "New course". Instructors start in Draft. */
const emptyCourse = (admin) => ({
  ...Object.fromEntries(SECTIONS.flatMap((s) => s.f || []).map((f) => [f.k, ''])),
  id: '', status: admin ? 'Available' : 'Draft', delivery: 'ILT', instructors: [], lessons: [], schedules: []
});
// a course's address next to the list page (keeps a ?as= on the instructor area)
const courseUrl = (back, id) => back.replace(/(\?|$)/, `/${id}$1`);

/**
 * The course page: every field, lessons, schedule, syllabus and reviews.
 * `create`: the same form for a new course; it's saved as a new course and then opens as a normal course page.
 * `back`: where Back / delete return to (the instructor area passes its own My Courses path).
 */
export default function CourseDetail({ back = '/courses', create = false }) {
  const isAdmin = useAuth().user?.role === 'Admin';
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { courses, ratings, reload, loading } = useData();
  const rated = ratings.courses[id];
  const [blank] = useState(() => emptyCourse(isAdmin));
  const custom = useCustomFields().courses;
  const saved = create ? blank : courses.find((c) => c.id === id);
  const leaving = useRef(false); // just created: open the new course without the unsaved-changes question
  // new course: a Word outline read into the form; its file is attached when the course is created
  const [outlineDoc, setOutlineDoc] = useState(null); // { token, filename }
  const [reading, setReading] = useState(false);
  const fileIn = useRef(null);
  const fillFromOutline = async (file) => {
    if (!file) return;
    setReading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post('/api/outlines/fill', fd);
      setDraft((d) => {
        const next = { ...d };
        // what the outline says replaces the form, except a name or code already typed in
        for (const [k, v] of Object.entries(r.patch)) if (!((k === 'name' || k === 'code') && String(d[k] || '').trim())) next[k] = v;
        if (r.lessons.length) next.lessons = d.lessons.length ? [...d.lessons, ...r.lessons] : r.lessons;
        return next;
      });
      setDirty(true); setOutlineDoc({ token: r.token, filename: r.filename }); setTab('details');
      toast(`Filled from ${r.filename}${r.lessons.length ? ` · ${r.lessons.length} lessons` : ''}${r.warnings.length ? ` · ${r.warnings.join(' ')}` : ''}`);
    } catch (e) { toast(e.message); } finally { setReading(false); if (fileIn.current) fileIn.current.value = ''; }
  };
  const pickOutline = () => fileIn.current?.click();
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const location = useLocation();
  const [tab, setTab] = useState(() => location.state?.tab || 'details'); // the Schedule page opens a course on its Schedule tab
  const [errors, setErrors] = useState({});
  // new course without a code: show the one that will be made (the next in the series the platform's courses use)
  const [autoCode, setAutoCode] = useState('');
  const platformNow = draft?.platform || '';
  useEffect(() => {
    if (!create) return undefined;
    const t = setTimeout(() => api.get('/api/courses/next-code?platform=' + encodeURIComponent(platformNow)).then((r) => setAutoCode(r.code)).catch(() => setAutoCode('')), 250);
    return () => clearTimeout(t);
  }, [create, platformNow]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  // learner sign-ins made for new emails on the batches (after creating, they come along with the page change)
  const [accounts, setAccounts] = useState(() => location.state?.accounts || null);

  useEffect(() => { if (saved && (!draft || draft.id !== saved.id)) { setDraft(structuredClone(saved)); setDirty(false); setErrors({}); setTab(location.state?.tab || 'details'); } }, [saved, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  // the course changed on the server (another tab, an import…) and nothing is being edited here: show the new version
  useEffect(() => { if (saved && draft && draft.id === saved.id && !dirty) setDraft(structuredClone(saved)); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (k) => (v) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const save = async () => {
    setBusy(true); setErrors({});
    try {
      if (create) {
        const c = await api.post('/api/courses', { ...draft, outlineToken: outlineDoc?.token });
        leaving.current = true; setDirty(false);
        await reload(['courses', 'instructors', 'activity']);
        toast('Created ' + c.name); nav(courseUrl(back, c.id), { replace: true, state: c.accounts?.length ? { accounts: c.accounts } : undefined }); return true;
      }
      const r = await api.put('/api/courses/' + id, draft);
      setDirty(false); await reload(['courses', 'instructors', 'activity', 'users']); setDraft(null); toast('Saved ' + draft.name);
      if (r.accounts?.length) setAccounts(r.accounts);
      return true;
    } catch (e) {
      setErrors(e.fields || {});
      const first = e.fields && Object.keys(e.fields)[0];
      if (first === 'schedules') { setTab('schedule'); toast(`Not ${create ? 'created' : 'saved'}. ` + e.fields.schedules); }
      else if (first) {
        setTab('details');
        const label = SECTIONS.flatMap((s) => s.f || []).find((f) => f.k === first)?.l || first;
        toast(`Not ${create ? 'created' : 'saved'}. ${label}: ${e.fields[first]}`);
        // the field may be far down the page: bring it into view
        setTimeout(() => { const el = document.getElementById('d-' + first); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true }); }, 50);
      } else { setTab('details'); toast(e.message); }
      return false;
    } finally { setBusy(false); }
  };
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && !busy) save(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  if (loading && !create) return <p className="note">Loading…</p>;
  if (!saved) return <div className="empty"><b>Course not found</b><span>It may have been deleted.</span><button className="btn sm" onClick={() => nav(back)}>Back to courses</button></div>;
  if (!draft) return null;

  return (
    <>
      <section className="dhead">
        <div className="l">
          <button className="back" onClick={() => nav(back)}><Icon name="back" small />Courses</button>
          {draft.code && <span className="code">{draft.code}</span>}<h1>{draft.name || (create ? 'New course' : 'Untitled course')}</h1>
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><StatusPill status={draft.status} />{draft.customFor && <span className="pill cv-pill" title={`Custom version for ${draft.customFor}`}>Custom · {draft.customFor}</span>}{draft.platform && <span className="chip">{draft.platform}</span>}{draft.product && <span className="pill warn" style={{ height: 22 }}>{draft.product}</span>}
            {rated && <button type="button" className="crev-pill" onClick={() => setTab('reviews')} title="See learner reviews">★ {rated.avg.toFixed(1)} <span>({rated.count})</span></button>}</span>
        </div>
        <div className="actions">
          {dirty && !create && <span className="unsaved">Unsaved changes</span>}
          {create ? (<>
            <span className="note">Only the course name is required: a code is made if you leave it blank. Everything else can be added now or later.</span>
            <input ref={fileIn} type="file" accept=".docx,.doc" hidden onChange={(e) => fillFromOutline(e.target.files[0])} />
            <button className="btn" onClick={pickOutline} disabled={reading} title="Fill this form from a Word outline (.docx, .doc)"><Icon name="file" small />{reading ? 'Reading…' : 'Upload outline'}</button>
            <button className="btn" onClick={() => nav(back)}>Cancel</button>
            <button className="btn primary" onClick={save} disabled={busy}><Icon name="plus" small />{busy ? 'Creating…' : 'Create course'}</button>
          </>) : (<>
          <button className="btn" onClick={() => setOutlineOpen(true)} disabled={dirty} title={dirty ? 'Save your changes first' : 'Read a Word outline into this course'}><Icon name="file" small />Upload outline</button>
          {/* the PDF is built from the saved course, so unsaved edits have to be saved first */}
          <button className="btn" title={dirty ? 'Save your changes first so the PDF includes them' : 'Download this course as a PDF'}
            onClick={() => { if (dirty) toast('Save your changes first, so the PDF includes them'); else setPdfOpen(true); }}><Icon name="download" small />Download PDF</button>
          <button className="btn" onClick={() => setCustomOpen(true)} disabled={dirty} title={dirty ? 'Save your changes first' : 'Copy this course for one client'}><Icon name="people" small />Custom version</button>
          <button className="btn primary" onClick={save} disabled={busy}><Icon name="save" small />Save changes</button>
          {isAdmin && <button className="icon-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setConfirmDel(true)} aria-label="Delete course" title="Delete course"><Icon name="trash" /></button>}
          </>)}
        </div>
      </section>
      {!create && <CustomVersions course={saved} back={back} />}
      <InstructorAccounts who="learner" accounts={accounts} onClose={() => { setAccounts(null); if (location.state?.accounts) nav(location.pathname, { replace: true }); }} />
      {!create && <CoursePdfDialog ids={pdfOpen ? [id] : null} onClose={() => setPdfOpen(false)} />}
      {create && outlineDoc && (
        <div className="cv-bar nc-doc"><span className="cv-for"><Icon name="file" small />Filled from <b>{outlineDoc.filename}</b> · the file is attached as the course outline when you create the course. Check the fields below.</span>
          <button type="button" className="linkbtn" onClick={() => setOutlineDoc(null)} title="Keep the filled-in fields but don't attach the file">Don't attach</button></div>
      )}
      {tab !== 'schedule' && <NextBatchBar batches={draft.schedules} onAll={() => setTab('schedule')} allLabel="Manage schedule"
        none={<button type="button" className="nb nb-none" onClick={() => setTab('schedule')}><Icon name="cal" small />No upcoming batch scheduled. <b>Add one</b></button>} />}
      <div className="tabs" role="tablist" aria-label="Course sections">
        {[['details', 'file', 'Course Details & All Fields'], ['lessons', 'book', 'Curriculum & Lessons', draft.lessons.length], ['schedule', 'clock', 'Schedule', (draft.schedules || []).filter((b) => b.endDate >= new Date().toISOString().slice(0, 10)).length], ['syllabus', 'eye', 'Syllabus Preview'], !create && ['reviews', 'star', 'Reviews', rated?.count]].filter(Boolean).map(([t, ic, l, n]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}><Icon name={ic} small />{l}{n ? <span className="n">{n}</span> : null}</button>
        ))}
      </div>
      {tab === 'details' && SECTIONS.map((s) => (
        <section key={s.t} className="card sec">
          <h2><span className="cico"><Icon name={s.i} small /></span>{s.t}{s.picker && <span className="note"> ({draft.instructors.length} assigned)</span>}
            {s.upload && <button className="btn sm sec-act" onClick={() => (create ? pickOutline() : setOutlineOpen(true))} disabled={create ? reading : dirty} title={!create && dirty ? 'Save your changes first' : 'Fill topics and objectives from a Word outline'}><Icon name="upload" small />Upload from Word</button>}</h2>
          {s.upload && <p className="note" style={{ margin: 0 }}>Type here and format with the toolbar, paste from Word, or upload a Word outline (.docx, .doc). Bold text, headings and bullet levels are kept.</p>}
          {s.picker ? <InstructorPicker value={draft.instructors} onChange={set('instructors')} /> : (
            <div className={s.g}>{s.f.map((f) => f.type === 'rich' ? (
              <RichText key={f.k} id={'d-' + f.k} labelClass="lbl" label={f.l} placeholder={f.ph} value={draft[f.k]} onChange={set(f.k)} />
            ) : (
              <Field key={f.k} id={'d-' + f.k} labelClass="lbl" className={f.w || ''} label={f.l} type={f.type || 'text'} options={f.o} required={!!f.req && !(create && f.k === 'code')} hideEmpty={!!f.req}
                placeholder={create && f.k === 'code' ? (autoCode ? `Leave blank for ${autoCode}` : 'Leave blank to make one') : f.ph} step={f.step} value={draft[f.k]} onChange={set(f.k)} error={errors[f.k]} />
            ))}</div>
          )}
        </section>
      ))}
      {tab === 'details' && custom.length > 0 && (
        <section className="card sec">
          <h2><span className="cico"><Icon name="plus" small /></span>Additional fields <span className="note">({custom.length}, added from spreadsheet imports)</span></h2>
          <div className="g3">{custom.map((f) => (
            <Field key={f.key} id={'d-' + f.key} labelClass="lbl" label={f.label} value={draft.extra?.[f.key] || ''} onChange={(v) => { setDraft((d) => ({ ...d, extra: { ...(d.extra || {}), [f.key]: v } })); setDirty(true); }} />
          ))}</div>
        </section>
      )}
      {tab === 'lessons' && <Lessons lessons={draft.lessons} onChange={set('lessons')} />}
      {tab === 'schedule' && <ScheduleEditor course={draft} onChange={set('schedules')} error={errors.schedules} />}
      {tab === 'syllabus' && <Syllabus c={draft} onGoLessons={() => setTab('lessons')} />}
      {tab === 'reviews' && <Reviews id={id} r={rated} />}

      {!create && <CustomVersionDialog open={customOpen} course={saved} back={back} onClose={() => setCustomOpen(false)} />}
      {!create && <OutlineDialog open={outlineOpen} courseId={id} onClose={() => setOutlineOpen(false)} onDone={() => { setDraft(null); }} />}
      <Confirm open={confirmDel} title="Delete course?" message={`This removes ${draft.name} from Hazdemy.${draft.lessons.length ? ` Its ${draft.lessons.length} lessons will be deleted too.` : ''}`} confirmLabel="Delete course" busy={busy}
        onClose={() => setConfirmDel(false)} onConfirm={async () => { setBusy(true); await api.del('/api/courses/' + id); setDirty(false); await reload(['courses', 'activity']); setBusy(false); toast('Deleted ' + draft.name); nav(back); }} />
      <Dialog open={blocker.state === 'blocked'} title={create ? 'Discard this new course?' : 'Discard unsaved changes?'} subtitle={create ? 'It hasn’t been created yet, so what you entered will be lost.' : `You have changes to ${draft.name} that aren’t saved.`} onClose={() => blocker.reset?.()}
        footer={<>
          <button className="btn" onClick={() => blocker.reset?.()}>Keep editing</button>
          <button className="btn" onClick={() => { setDirty(false); blocker.proceed?.(); }}>Discard changes</button>
          {!create && <button className="btn primary" onClick={async () => { if (await save()) blocker.proceed?.(); else blocker.reset?.(); }}><Icon name="save" small />Save and continue</button>}
        </>} />
    </>
  );
}
