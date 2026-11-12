import { useState } from 'react';
import Icon from './Icon.jsx';

/** An instructor's "IP Owned" list as [{ code, title }] (older data may be plain text "A, B"). */
export function ownedList(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;\n]/).map((code) => ({ code: code.trim() }));
  const seen = new Set();
  return list.map((e) => (typeof e === 'string' ? { code: e } : e || {}))
    .map((e) => ({ code: String(e.code || '').trim(), title: String(e.title || '').trim() }))
    .filter((e) => { const k = (e.code || e.title).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
/** "HAZ-DA-0001 Course title; …" for CSV exports and search. */
export const ownedText = (v) => ownedList(v).map((e) => [e.code, e.title].filter(Boolean).join(' ')).join('; ');

/**
 * Add a course they developed by hand: its code and title. `known(code)` finds the Hazdemy course with that code
 * (to fill the title in); `onAdd({ code, title })` is called with the new entry.
 */
export function AddOwnedCourse({ onAdd, known, busy, compact }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const match = code.trim() && known?.(code.trim());
  const add = () => {
    const c = code.trim(), t = title.trim() || match?.name || '';
    if (!c && !t) { setErr('Enter the course code or title.'); return; }
    onAdd({ code: c, title: t }); setCode(''); setTitle(''); setErr('');
  };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  return (
    <div className={`own-add${compact ? ' compact' : ''}`}>
      <input aria-label="Course code" placeholder="Course code" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} onKeyDown={onKey} maxLength={60} />
      <input aria-label="Course title" placeholder={match ? match.name : 'Course title'} value={title} onChange={(e) => { setTitle(e.target.value); setErr(''); }} onKeyDown={onKey} maxLength={200} />
      <button type="button" className="btn sm" onClick={add} disabled={busy}><Icon name="plus" small />Add</button>
      {match && !title && <span className="note own-hint">In Hazdemy: {match.name}</span>}
      {err && <span className="err own-hint">{err}</span>}
    </div>
  );
}

/** The editable list (instructor's own profile): code + title rows with remove, and the add form. */
export default function OwnedCourses({ value, onChange, known }) {
  const list = ownedList(value);
  return (
    <div className="own">
      {list.length ? (
        <ul className="own-list">{list.map((e) => (
          <li key={(e.code || e.title).toLowerCase()}>
            {e.code ? <span className="code">{e.code}</span> : <span className="code own-nocode">no code</span>}
            <span className="own-t">{e.title || known?.(e.code)?.name || <span className="note">No title</span>}</span>
            <button type="button" className="iv-rm" onClick={() => onChange(list.filter((x) => x !== e))} aria-label={`Remove ${e.code || e.title}`} title="Remove"><Icon name="x" small /></button>
          </li>
        ))}</ul>
      ) : <p className="note" style={{ margin: 0 }}>No courses listed yet.</p>}
      <AddOwnedCourse known={known} onAdd={(e) => onChange([...list, e])} />
    </div>
  );
}
