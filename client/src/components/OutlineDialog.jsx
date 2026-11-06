import { useEffect, useMemo, useState } from 'react';
import { Dialog } from './ui.jsx';
import Icon from './Icon.jsx';
import { api } from '../api.js';
import { useData, useToast } from '../lib/store.jsx';
import { fmtMins } from '../lib/constants.js';
import { RichView } from './RichText.jsx';

const LESSON_MODES = [['replace', 'Also turn topics into lessons (replace existing lessons)'], ['append', 'Also turn topics into lessons (add after existing lessons)'], ['keep', 'Only fill Course topics; don’t change lessons']];

/**
 * Upload Word course outlines (.docx / .doc). The server reads each file, finds the title, objectives,
 * audience, prerequisites and topics, and suggests the matching course; the user confirms before anything is saved.
 * Pass courseId to send every file to one course (used from the course page).
 */
export default function OutlineDialog({ open, onClose, courseId, onDone, courseIds }) { // courseIds: limit targets (an instructor's own courses)
  const { courses, reload } = useData();
  const toast = useToast();
  const [items, setItems] = useState([]); // parsed files + the user's choices
  const [mode, setMode] = useState('replace');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  useEffect(() => { if (open) { setItems([]); setMode('replace'); setError(''); setOpenRow(null); } }, [open]);
  const sorted = useMemo(() => courses.filter((c) => !courseIds || courseIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)), [courses, courseIds]);
  const fixed = courses.find((c) => c.id === courseId);

  const upload = async (files) => {
    files = [...files].filter(Boolean);
    if (!files.length) return;
    setBusy(`Reading ${files.length} file${files.length > 1 ? 's' : ''}…`); setError('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const { items: got } = await api.post('/api/outlines/parse', fd);
      setItems((cur) => [...cur, ...got.map((it) => ({ ...it, include: !it.error, target: courseId || (it.match?.courseId && (!courseIds || courseIds.has(it.match.courseId)) ? it.match.courseId : '') }))]);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const update = (i, patch) => setItems((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const chosen = items.filter((it) => it.include && !it.error);

  const apply = async () => {
    setBusy('Saving…'); setError('');
    try {
      const { results } = await api.post('/api/outlines/apply', { items: chosen.map((it) => ({ token: it.token, courseId: it.target, lessons: mode })) });
      await reload(['courses', 'activity']);
      const ok = results.filter((r) => !r.error), bad = results.filter((r) => r.error);
      const made = ok.filter((r) => r.created).length;
      toast(`Imported ${ok.length} outline${ok.length === 1 ? '' : 's'}${made ? ` · ${made} new course${made > 1 ? 's' : ''}` : ''}`);
      if (bad.length) { setError(bad.map((r) => `${r.filename || 'File'}: ${r.error}`).join(' ')); setItems((cur) => cur.filter((it) => !it.include || it.error)); }
      else { onDone?.(results); onClose(); }
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <Dialog open={open} onClose={onClose} wide
      title={fixed ? 'Upload course outline' : 'Import course outlines'}
      subtitle={fixed ? `Fill the course topics, objectives and details of ${fixed.name} from a Word outline.` : 'Upload one or more Word outlines. Hazdemy reads the course topics, objectives, description, audience and prerequisites, and matches each file to a course.'}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!!busy || !chosen.length} onClick={apply}>
          <Icon name="upload" small />{busy === 'Saving…' ? 'Saving…' : chosen.length ? `Apply ${chosen.length} outline${chosen.length > 1 ? 's' : ''}` : 'Apply outlines'}
        </button>
      </>}>
      <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        <Icon name="file" /><b>Choose Word documents (.docx, .doc)</b>
        <span className="note">{fixed ? 'or drop the outline here' : 'Select several at once, or drop them here · up to 50 files'}</span>
        <label className="btn sm" htmlFor="olFiles" style={{ cursor: 'pointer' }}>Choose files</label>
        <input type="file" id="olFiles" className="sr" multiple={!fixed} accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>

      {busy && busy !== 'Saving…' && <p className="note" style={{ margin: 0 }} role="status">{busy}</p>}
      {error && <p className="err" role="alert">{error}</p>}

      {items.length > 0 && (
        <>
          <div className="fg">
            <label htmlFor="olMode">Lessons</label>
            <select id="olMode" value={mode} onChange={(e) => setMode(e.target.value)}>
              {LESSON_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <p className="note" style={{ margin: 0 }}>Course topics, objectives, description, audience and prerequisites are replaced by what’s in the document. Duration, hours, skill level and modality are only filled in where the course has none. The original file is attached as the course outline.</p>
          <ul className="ol-list">
            {items.map((it, i) => {
              const p = it.parsed, mins = p ? p.topics.reduce((a, t) => a + (+t.mins || 0), 0) : 0;
              const target = courses.find((c) => c.id === it.target);
              return (
                <li key={i} className={`ol-item${it.error ? ' bad' : ''}${it.include ? '' : ' off'}`}>
                  <div className="ol-top">
                    {!it.error && <input type="checkbox" checked={it.include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={'Include ' + it.filename} />}
                    <span className="ol-ic"><Icon name={it.error ? 'alert' : 'file'} small /></span>
                    <div className="ol-name"><b>{it.filename}</b>{p?.name && p.name !== it.filename.replace(/\.[^.]+$/, '') && <span>{p.name}</span>}</div>
                    {!it.error && <button className="linkbtn" onClick={() => setOpenRow(openRow === i ? null : i)} aria-expanded={openRow === i}>{openRow === i ? 'Hide' : 'Preview'}</button>}
                    <button className="icon-btn" onClick={() => setItems((cur) => cur.filter((_, j) => j !== i))} aria-label={'Remove ' + it.filename} title="Remove"><Icon name="x" small /></button>
                  </div>
                  {it.error ? <p className="err" style={{ margin: 0 }}>{it.error}</p> : (
                    <>
                      <div className="ol-row">
                        <label className="sr" htmlFor={'olT' + i}>Course for {it.filename}</label>
                        <select id={'olT' + i} className="sel" value={it.target} disabled={!!fixed} onChange={(e) => update(i, { target: e.target.value })}>
                          <option value="">＋ Create new course{p.name ? `: ${p.name}` : ''}</option>
                          {sorted.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                        </select>
                        {!fixed && (it.target && it.target === it.match?.courseId
                          ? <span className="pill ok"><Icon name="check" small />Matched by {it.match.by}</span>
                          : !it.target ? <span className="pill acc">New course</span> : <span className="pill gone">Chosen manually</span>)}
                      </div>
                      <div className="chips ol-found">
                        <span className={`chip${p.objectives.length ? '' : ' none'}`}>{p.objectives.length} objectives</span>
                        <span className={`chip${p.topics.length ? '' : ' none'}`}>{p.topics.length} topics{mins ? ` · ${fmtMins(mins)}` : ''}</span>
                        {p.description && <span className="chip">Description</span>}
                        {p.persona && <span className="chip">Audience</span>}
                        {p.prereqs && <span className="chip">Prerequisites</span>}
                        {(p.duration !== '' || p.hours !== '') && <span className="chip">{[p.duration !== '' && `${p.duration} days`, p.hours !== '' && `${p.hours} h`].filter(Boolean).join(' · ')}</span>}
                        {p.skill && <span className="chip">{p.skill}</span>}
                      </div>
                      {it.warnings.map((w) => <p key={w} className="note ol-warn">{w}</p>)}
                      {target && mode === 'replace' && p.topics.length > 0 && target.lessons?.length > 0 && <p className="note ol-warn">Replaces {target.lessons.length} existing lesson{target.lessons.length > 1 ? 's' : ''} in {target.code}.</p>}
                      {openRow === i && (
                        <div className="ol-preview">
                          {p.description && <section><h4>Description</h4><p>{p.description}</p></section>}
                          {p.objectives.length > 0 && <section><h4>Objectives</h4>{p.objectivesHtml ? <RichView value={p.objectivesHtml} /> : <ul>{p.objectives.map((o, k) => <li key={k}>{o}</li>)}</ul>}</section>}
                          {p.persona && <section><h4>Audience</h4><p>{p.persona}</p></section>}
                          {p.prereqs && <section><h4>Prerequisites</h4><p>{p.prereqs}</p></section>}
                          {p.topics.length > 0 && p.topicsHtml && <section><h4>Course topics</h4><RichView value={p.topicsHtml} /></section>}
                          {p.topics.length > 0 && !p.topicsHtml && <section><h4>Course topics</h4><ol>{p.topics.map((t, k) => <li key={k}><b>{t.title}</b>{t.mins ? <span className="note"> · {fmtMins(t.mins)}</span> : null}{t.points.length > 0 && <ul>{t.points.map((pt, x) => <li key={x}>{pt}</li>)}</ul>}</li>)}</ol></section>}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Dialog>
  );
}
