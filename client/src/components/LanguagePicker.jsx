import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { LANGUAGES } from '../lib/languages.js';

const split = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * "Delivery languages": pick from a list of languages, or type one that isn't listed and press Enter.
 * `value` / `onChange` use the same comma-separated text as before ("English, Hindi"), so nothing else changes.
 */
export default function LanguagePicker({ id = 'langs', label = 'Delivery languages', value, onChange, className = '' }) {
  const picked = split(value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null), input = useRef(null);
  useEffect(() => {
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);
  const all = useMemo(() => [...new Set(LANGUAGES)].sort((a, b) => a.localeCompare(b)), []);
  const s = q.trim().toLowerCase();
  const options = all.filter((l) => !picked.some((p) => same(p, l)) && (!s || l.toLowerCase().includes(s)));
  const set = (list) => onChange(list.join(', '));
  const add = (l) => { const t = l.trim(); if (t && !picked.some((p) => same(p, t))) set([...picked, t]); setQ(''); input.current?.focus(); };
  const drop = (l) => set(picked.filter((p) => p !== l));
  const exact = all.find((l) => same(l, q.trim()));
  const onKey = (e) => {
    // Enter: the exact language, else the first suggestion, else what was typed (a language not in the list)
    if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) add(exact || options[0] || q); }
    else if (e.key === 'Backspace' && !q && picked.length) drop(picked[picked.length - 1]);
    else if (e.key === 'Escape') setOpen(false);
  };
  return (
    <div className={`fg ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      <div className="picker lang-pick" ref={box}>
        <div className="lang-box" onClick={() => { input.current?.focus(); setOpen(true); }}>
          {picked.map((l) => (
            <span key={l} className="ichip">{l}
              <button type="button" onClick={(e) => { e.stopPropagation(); drop(l); }} aria-label={'Remove ' + l}><Icon name="x" small /></button></span>
          ))}
          <input ref={input} id={id} value={q} autoComplete="off" placeholder={picked.length ? 'Add another…' : 'Search or type a language…'}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKey} />
        </div>
        {open && (
          <div className="pick-pop lang-pop"><div className="pick-list" role="listbox" aria-label="Languages">
            {q.trim() && !exact && !picked.some((p) => same(p, q.trim())) && (
              <button type="button" className="lang-opt add" onClick={() => add(q)}><Icon name="plus" small />Add “{q.trim()}”</button>
            )}
            {options.length ? options.map((l) => <button key={l} type="button" className="lang-opt" onClick={() => add(l)}>{l}</button>)
              : !q.trim() && <p className="note" style={{ padding: 12, margin: 0 }}>Every language in the list is added.</p>}
          </div></div>
        )}
      </div>
    </div>
  );
}
