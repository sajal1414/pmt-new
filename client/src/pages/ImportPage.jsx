import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import InstructorAccounts from '../components/InstructorAccounts.jsx';
import { DataTable, Dialog, PageHead, EmptyState, sortRows } from '../components/ui.jsx';
import { api } from '../api.js';
import { useData, useToast } from '../lib/store.jsx';

// column headings for the fields a sheet can fill
const LABELS = {
  courses: {
    code: 'Course code', name: 'Course name', ibmCode: 'IBM course codes', pmt: 'On IBM PMT', status: 'Status', vendor: 'Vendor', platform: 'Platform', portfolio: 'Portfolio', product: 'Product',
    instructors: 'Instructors', delivery: 'Modality', duration: 'Duration (days)', hours: 'Hours', outlineStatus: 'Outline status', outline: 'Outline link', description: 'Description',
    objectives: 'Objectives', topics: 'Topics', skill: 'Skill level', maxStudents: 'Max students', prereqs: 'Pre reqs', persona: 'Persona', labConfig: 'Lab configuration',
    deliveryNotes: 'Delivery notes', labLocation: 'Lab location', ipOwner: 'IP owner', author: 'Author', planned: 'Planned completion', release: 'Release date', retire: 'Retire date',
    ibmRetire: 'IBM retirement', dailyRate: 'Daily rate', materialsCost: 'Materials cost', labCost: 'Lab cost', learningPath: 'Learning path', badge: 'Badge', certification: 'Certification',
    recordSource: 'Record source', notes: 'Notes', created: 'Create date'
  },
  instructors: {
    name: 'Name', email: 'Email', phone: 'Phone', location: 'Location', travel: 'Travel', vendor: 'Vendor', platforms: 'Platforms', portfolio: 'Portfolio', product: 'Product',
    skills: 'Skills / products', canTeach: 'Course Author', qualified: 'Qualified to teach', ipOwned: 'IP Owned (courses developed)', languages: 'Languages', rating: 'Rating', comments: 'Comments'
  }
};
// why a row can't be imported yet; each kind has its own tab: [tab name, tone, icon, what's empty on that tab]
const KINDS = {
  missing: ['Missing data', 'red', 'alert', 'No rows have empty required cells.'],
  invalid: ['Invalid values', 'red', 'x', 'No rows have invalid values.'],
  duplicate: ['Duplicate in file', 'warn', 'layers', 'No row repeats an earlier one.'],
  exists: ['Already in Hazdemy', 'warn', 'db', 'Nothing in this file is in Hazdemy yet.']
};
const isKind = (t) => t in KINDS;
const LESSON_COLS = [['code', 'Course code'], ['order', 'Order'], ['title', 'Lesson title'], ['mins', 'Minutes'], ['video', 'Video'], ['attachment', 'Attachment'], ['article', 'Article']];
// an added field's value: on a ready row it's in `extra`, on a skipped row it's under its column key
const valueOf = (r, k) => (k.startsWith('cf:') ? r.extra?.[k.slice(3)] ?? r[k] : r[k]);
const text = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
// long cells stay short in the table; the full text shows on hover
const Cell = ({ v }) => { const t = text(v); return t ? <span className="imp-cell" title={t.length > 60 ? t : undefined}>{t}</span> : <span className="note">—</span>; };

/** Fill in or correct the cell that stops a row importing; Enter or "Add" applies it. */
function FixBox({ r, label, initial = '', busy, onFix }) {
  const [v, setV] = useState(initial);
  const hint = r.kind === 'exists' ? `New ${label.toLowerCase()}` : r.kind === 'missing' ? `Add ${label}` : `Correct ${label}`;
  const apply = (e) => { e.preventDefault(); if (v.trim()) onFix(v.trim()); };
  return (
    <form className="imp-fix" onSubmit={apply} noValidate>
      <label className="sr" htmlFor={'fix-' + r.row}>{hint} for row {r.row}</label>
      <input id={'fix-' + r.row} value={v} onChange={(e) => setV(e.target.value)} placeholder={hint} type={r.field === 'email' ? 'email' : 'text'} autoComplete="off" disabled={busy} />
      <button className="btn sm primary" type="submit" disabled={busy || !v.trim()}><Icon name="check" small />{r.kind === 'exists' ? 'Use' : 'Add'}</button>
    </form>
  );
}

/**
 * Bulk import on its own page: choose a spreadsheet, see every row it will add (all columns) and every row it
 * skips with the reason, then import. Nothing is saved until "Import".
 */
export default function ImportPage({ kind }) {
  const isC = kind === 'courses';
  const nav = useNavigate();
  const toast = useToast();
  const { reload, courses } = useData();
  const back = isC ? '/courses' : '/instructors';
  const noun = isC ? 'courses' : 'instructors';
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  const [sheet, setSheet] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState('good');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'row', dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  // what gets imported: ticked rows (by spreadsheet row) and ticked columns; everything starts ticked
  const [selRows, setSelRows] = useState(() => new Set());
  const [offCols, setOffCols] = useState(() => new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const [addFields, setAddFields] = useState([]); // new sheet columns ticked to become Hazdemy fields
  const [fixes, setFixes] = useState({}); // { row: { field: value } } typed in on this page; the file isn't changed
  const [force, setForce] = useState([]); // rows with missing data imported anyway (moved to Ready)
  const [selMissing, setSelMissing] = useState(() => new Set()); // rows ticked on the Missing data tab
  const [nameAns, setNameAns] = useState({}); // look-alike instructor name in the sheet -> 'same' | 'new' | 'fix' (asked before importing)
  const [nameFix, setNameFix] = useState({}); // ... and the corrected spelling, for 'fix'
  const [prefer, setPrefer] = useState([]); // duplicate rows chosen over the earlier row with the same code/email
  const [compare, setCompare] = useState(null); // the duplicate / existing row open in the Compare window
  const need = isC ? ['code', 'name'] : ['name', 'email'];
  const rowsRef = useRef([]); // the ready rows listed now (after the search), for the header checkbox
  const setRowsOn = (list, on) => setSelRows((s) => { const n = new Set(s); for (const r of list) { if (on) n.add(r.row); else n.delete(r.row); } return n; });
  const flipCol = (k) => setOffCols((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const send = (commit, f = file, rep = replace, sh = sheet, adding = addFields, fx = fixes, fo = force, pr = prefer) => {
    const fd = new FormData();
    fd.append('file', f); fd.append('replace', String(rep)); fd.append('commit', String(commit)); if (sh) fd.append('sheet', sh);
    fd.append('addFields', JSON.stringify(adding)); fd.append('fixes', JSON.stringify(fx)); fd.append('force', JSON.stringify(fo)); fd.append('prefer', JSON.stringify(pr));
    if (commit) fd.append('sameAs', JSON.stringify(Object.fromEntries((preview?.nameChecks || []).filter((n) => n.likeId && nameAns[n.row] === 'same').map((n) => [n.row, n.likeId]))));
    if (commit) fd.append('nameMap', JSON.stringify(Object.fromEntries((preview?.nameChecks || []).filter((n) => nameAns[n.name] === 'same' || (nameAns[n.name] === 'fix' && nameFix[n.name]?.trim())).map((n) => [n.name, nameAns[n.name] === 'same' ? n.like : nameFix[n.name].trim()]))));
    if (commit && preview) { fd.append('rows', JSON.stringify([...selRows])); fd.append('columns', JSON.stringify((preview.columns || []).filter((k) => !offCols.has(k)))); }
    return api.post('/api/import/' + kind, fd);
  };
  // `keep`: same file, only the new-field choice changed, so the row and column ticks stay as they were
  const analyse = async (f, rep = replace, sh = sheet, adding = addFields, keep = false, fx = fixes, fo = force, pr = prefer) => {
    const before = new Set((preview?.good || []).map((g) => g.row)); // rows already ready: a newly fixed row starts ticked
    if (!f) return;
    setBusy(true); setError(''); if (!keep) { setPreview(null); setPage(1); setQ(''); }
    try {
      const p = await send(false, f, rep, sh, adding, fx, fo, pr); setPreview(p); setSheet(p.sheet);
      if (!keep) { setTab(p.goodCount || !p.badCount ? 'good' : Object.keys(KINDS).find((k) => p.bad.some((b) => b.kind === k))); setOffCols(new Set()); }
      setSelMissing((s) => new Set([...s].filter((row) => p.bad.some((b) => b.row === row && b.kind === 'missing'))));
      setSelRows((prev) => (keep ? new Set(p.good.filter((g) => prev.has(g.row) || !before.has(g.row)).map((g) => g.row)) : new Set(p.good.map((g) => g.row))));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const pickFile = (f) => { if (!f) return; setFile(f); setSheet(''); setAddFields([]); setFixes({}); setForce([]); setSelMissing(new Set()); setPrefer([]); analyse(f, replace, '', [], false, {}, [], []); };
  const useInstead = (r) => { const next = [...prefer.filter((x) => x !== r.dupOf), r.row]; setPrefer(next); setCompare(null); analyse(file, replace, sheet, addFields, true, fixes, force, next); };
  const importAnyway = (rowsList) => { const next = [...new Set([...force, ...rowsList])]; setForce(next); setSelMissing(new Set()); analyse(file, replace, sheet, addFields, true, fixes, next); };
  const undoForce = (row) => { const next = force.filter((x) => x !== row); setForce(next); analyse(file, replace, sheet, addFields, true, fixes, next); };
  const flipMissing = (list, on) => setSelMissing((s) => { const n = new Set(s); for (const r of list) { if (on) n.add(r.row); else n.delete(r.row); } return n; });
  const fixRow = (r, value) => { const next = { ...fixes, [r.row]: { ...(fixes[r.row] || {}), [r.field]: value } }; setFixes(next); analyse(file, replace, sheet, addFields, true, next); };
  const undoFix = (row) => { const next = { ...fixes }; delete next[row]; setFixes(next); analyse(file, replace, sheet, addFields, true, next); };
  const flipAdd = (h) => { const next = addFields.includes(h) ? addFields.filter((x) => x !== h) : [...addFields, h]; setAddFields(next); analyse(file, replace, sheet, next, true); };
  const setAdd = (list) => { setAddFields(list); analyse(file, replace, sheet, list, true); };
  const total = preview?.goodCount || 0, ready = preview ? preview.good.filter((g) => selRows.has(g.row)).length : 0;
  const lessonCount = preview?.lessons?.count || 0;
  // a problem tab whose last row was fixed or imported anyway disappears: go back to the ready rows
  useEffect(() => { if (preview && isKind(tab) && !preview.bad.some((x) => x.kind === tab)) setTab('good'); }, [preview, tab]);
  const [accounts, setAccounts] = useState(null);
  const commit = async () => {
    setBusy(true);
    try {
      const r = await send(true);
      await reload();
      toast(`${r.replace ? 'Loaded' : 'Imported'} ${r.imported} ${noun}${r.lessonsAdded ? ` and ${r.lessonsAdded} lessons` : ''}`);
      if (r.accounts?.length) setAccounts(r.accounts); else nav(back); // new instructors' sign-ins: show them before leaving
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // every column the sheet has (the required ones first), and the rows of the chosen tab
  const cfLabel = useMemo(() => Object.fromEntries((preview?.customFields || []).map((f) => [f.key, f])), [preview]);
  const labelOf = (k) => LABELS[kind][k] || cfLabel[k]?.label || k;
  const colKeys = useMemo(() => [...new Set([...need, ...(preview?.columns || [])])].filter((k) => LABELS[kind][k] || cfLabel[k]), [preview, kind, cfLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const fieldCols = useMemo(() => {
    return colKeys.map((k) => {
      const off = offCols.has(k), name = <>{labelOf(k)}{cfLabel[k]?.isNew && <span className="imp-new">New field</span>}</>;
      return {
        key: k, label: off ? <s title="Not imported">{name}</s> : name, sortable: true, tdClass: off ? 'imp-off' : undefined,
        render: (r) => (r.kind && r.field === k ? <span className={`imp-fault k-${r.kind}`}>{text(r[k]) || 'Missing'}</span> : r.fixed?.includes(k) ? <span className="imp-fixval" title="Filled in here, not in the spreadsheet">{text(r[k])}</span> : <Cell v={valueOf(r, k)} />)
      };
    });
  }, [colKeys, kind, offCols, cfLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const list = (tab === 'lessons' ? preview?.lessons?.rows : isKind(tab) ? preview?.bad.filter((b) => b.kind === tab) : preview?.good) || [];
    const s = q.trim().toLowerCase();
    const found = s ? list.filter((r) => Object.values({ ...r, ...r.extra }).some((v) => text(v).toLowerCase().includes(s))) : list;
    return sortRows(found.map((r, i) => ({ id: `${tab}-${r.row ?? ''}-${i}`, ...r })), sort, (r, k) => valueOf(r, k));
  }, [preview, tab, q, sort]);
  rowsRef.current = tab === 'good' || tab === 'missing' ? rows : [];
  const cols = useMemo(() => {
    const row = { key: 'row', label: 'Row', sortable: true, tdClass: 'num', render: (r) => (r.incomplete?.length ? <span className="imp-fixed">{r.row}<span className="pill red" title="Imported with this left empty: fill it in later">No {r.incomplete.map(labelOf).join(', ').toLowerCase()}</span><button type="button" className="linkbtn" onClick={() => undoForce(r.row)} disabled={busy} title="Back to Missing data">Undo</button></span> : r.fixed?.length ? <span className="imp-fixed">{r.row}<span className="pill ok">Fixed</span><button type="button" className="linkbtn" onClick={() => undoFix(r.row)} disabled={busy} title="Use the spreadsheet’s value again">Undo</button></span> : r.row ?? '—') };
    if (tab === 'lessons') return [...LESSON_COLS.map(([k, l]) => ({ key: k, label: l, sortable: true, render: (r) => <Cell v={r[k]} /> }))];
    const reason = {
      key: 'why', label: 'Why it’s skipped', sortable: true, tdStyle: { minWidth: 300, maxWidth: 440, whiteSpace: 'normal' }, render: (r) => {
        const [label, tone] = KINDS[r.kind] || ['Skipped', 'red'];
        return (
          <span className="imp-why">
            {!isKind(tab) && <span className={`pill ${tone}`}>{label}</span>}
            <span>{r.why}</span>
            {(r.kind === 'duplicate' || r.kind === 'exists') && <button type="button" className="btn sm" onClick={() => setCompare(r)}><Icon name="layers" small />Compare</button>}
            {r.existingId && <Link to={isC ? `/courses/${r.existingId}` : `/instructors/${r.existingId}`} target="_blank" rel="noopener">Open in Hazdemy<Icon name="ext" small /></Link>}
            {r.field && <FixBox key={r.row + r.field + r.why} r={r} label={labelOf(r.field)} initial={r.kind === 'exists' ? '' : fixes[r.row]?.[r.field] || (r.kind === 'invalid' ? text(r[r.field]) : '')} busy={busy} onFix={(v) => fixRow(r, v)} />}
          </span>
        );
      }
    };
    if (tab === 'missing') {
      const list = rowsRef.current, allOn = list.length > 0 && list.every((r) => selMissing.has(r.row)), someOn = list.some((r) => selMissing.has(r.row));
      const pickM = {
        key: 'pick', tdStyle: { width: 36 },
        label: <input type="checkbox" className="pick" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={() => flipMissing(list, !allOn)} aria-label={allOn ? 'Deselect the listed rows' : 'Select the listed rows'} title={allOn ? 'Deselect all listed' : 'Select all listed'} />,
        render: (r) => <input type="checkbox" className="pick" checked={selMissing.has(r.row)} onChange={() => flipMissing([r], !selMissing.has(r.row))} aria-label={'Select row ' + r.row} />
      };
      return [pickM, row, reason, ...fieldCols];
    }
    if (isKind(tab)) return [row, reason, ...fieldCols];
    const shown = rowsRef.current, allOn = shown.length > 0 && shown.every((r) => selRows.has(r.row)), someOn = shown.some((r) => selRows.has(r.row));
    const pick = {
      key: 'pick', tdStyle: { width: 36 },
      label: <input type="checkbox" className="pick" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={() => setRowsOn(shown, !allOn)} aria-label={allOn ? 'Deselect the listed rows' : 'Select the listed rows'} title={allOn ? 'Deselect all listed' : 'Select all listed'} />,
      render: (r) => <input type="checkbox" className="pick" checked={selRows.has(r.row)} onChange={() => setRowsOn([r], !selRows.has(r.row))} aria-label={'Import row ' + r.row} />
    };
    return [pick, row, ...fieldCols];
  }, [tab, fieldCols, selRows, selMissing, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const importLabel = busy ? 'Working…' : replace ? `Replace with ${ready} courses` : ready ? `Import ${ready} ${noun}${lessonCount ? ` + ${lessonCount} lessons` : ''}` : lessonCount ? `Import ${lessonCount} lessons` : `Import ${noun}`;
  const askKey = (n) => (n.likeId ? n.row : n.name); // instructor rows are asked one by one, course names once per name
  const checks = (preview?.nameChecks || []).filter((n) => !n.likeId || selRows.has(n.row));
  const unanswered = checks.filter((n) => !nameAns[askKey(n)] || (nameAns[askKey(n)] === 'fix' && !nameFix[n.name]?.trim())).length;
  const importBtn = <button className="btn primary" disabled={busy || !!unanswered || !(ready || (lessonCount && !total))} onClick={commit} title={unanswered ? 'Answer the instructor name questions above first' : undefined}><Icon name="upload" small />{unanswered ? `Check ${unanswered} instructor name${unanswered === 1 ? '' : 's'} first` : importLabel}</button>;

  return (
    <>
      <PageHead eyebrow={isC ? 'Courses' : 'Instructors'} title={isC ? 'Bulk import courses & lessons' : 'Bulk import instructors'}
        summary={<span className="note">{isC ? 'An Excel course catalog: a Courses sheet, plus an optional Lessons sheet with video links, attachments and articles.' : 'An Excel instructor list with names, emails, skills, locations, languages and travel preferences.'} Nothing is saved until you click Import.</span>}
        actions={<>
          <button className="btn" onClick={() => nav(back)}><Icon name="back" small />Back to {noun}</button>
          <a className="btn" href={'/api/import/sample/' + kind} download><Icon name="download" small />Sample spreadsheet</a>
          {preview && importBtn}
        </>} />

      <section className="card imp-top">
        <div className={`drop${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pickFile(e.dataTransfer.files[0]); }}>
          <Icon name="upload" /><b>{file ? file.name : 'Choose an Excel file (.xlsx)'}</b>
          <span className="note">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · choose another file to start over` : 'or drop it here · .xls and CSV also work'}</span>
          <label className="btn sm" htmlFor="impFile" style={{ cursor: 'pointer' }}>{file ? 'Choose another file' : 'Choose file'}</label>
          <input type="file" id="impFile" className="sr" accept=".xlsx,.xls,.xlsm,.csv" onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
        {(preview || isC) && (
          <div className="imp-opts">
            {preview && preview.sheets.length > 1 && (
              <div className="fg"><label htmlFor="sheetSel">{isC ? 'Courses sheet' : 'Instructors sheet'}</label>
                <select id="sheetSel" value={sheet} onChange={(e) => { setSheet(e.target.value); analyse(file, replace, e.target.value); }}>
                  {preview.sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows} rows)</option>)}
                </select>
              </div>
            )}
            {preview && preview.sheets.length === 1 && <p className="note" style={{ margin: 0 }}>{isC ? 'Courses' : 'Instructors'} sheet: “{preview.sheet}”{isC && (preview.lessons ? ` · Lessons sheet: “${preview.lessons.sheet}”` : ' · no Lessons sheet found')}</p>}
            {isC && (
              <label className="checkline" htmlFor="impReplace">
                <input type="checkbox" id="impReplace" checked={replace} onChange={(e) => { setReplace(e.target.checked); analyse(file, e.target.checked); }} />
                Replace all existing courses with this file <span className="note">(removes the {courses.length} courses in Hazdemy first)</span>
              </label>
            )}
          </div>
        )}
        {busy && <p className="note" style={{ margin: 0 }}>Reading {file?.name}…</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </section>

      {preview && (
        <>
          <div className="summary">
            <span className="pill acc imp-total" title={`Rows with data in “${preview.sheet}”`}><b>{total + preview.badCount}</b> rows in file</span>
            {total > 0 && <span className="pill ok">{ready} of {total} {noun} selected</span>}
            {preview.lessons && <span className="pill acc">{lessonCount} lessons for {preview.lessons.courses} courses</span>}
            {Object.entries(KINDS).map(([k, [label, tone]]) => { const n = preview.bad.filter((b) => b.kind === k).length; return n ? <button key={k} type="button" className={`pill ${tone} imp-kindpill`} onClick={() => { setTab(k); setQ(''); setPage(1); setSort({ key: 'row', dir: 1 }); }} title="Show these rows">{n} {label[0].toLowerCase() + label.slice(1)}</button> : null; })}
            {preview.updates > 0 && <span className="pill ok" title="Same name as an instructor already in Hazdemy: their profile gets this row’s email and details">{preview.updates} update existing instructor{preview.updates === 1 ? '' : 's'}</span>}
            {preview.blank > 0 && <span className="pill gone">{preview.blank} empty rows ignored</span>}
            {preview.ignored > 0 && <span className="pill gone">{preview.ignored} new column{preview.ignored === 1 ? '' : 's'} not added</span>}
          </div>
          {checks.length > 0 && (
            <section className={`card imp-names${unanswered ? ' open' : ''}`} role={unanswered ? 'alert' : undefined}>
              <div><b><Icon name="alert" small />{unanswered ? `${unanswered} instructor name${unanswered === 1 ? '' : 's'} to check before importing` : 'Instructor names checked'}</b>
                <p className="note" style={{ margin: 0 }}>{checks.length === 1 ? 'This name looks' : 'These names look'} like someone else. Is it the same person? Answer each one, so nobody gets two profiles.</p></div>
              <ul>{checks.filter((n) => n.likeId).map((n) => (
                <li key={'r' + n.row} className={nameAns[n.row] ? '' : 'todo'}>
                  <span>Row {n.row}: <b>{n.name}</b>{n.email ? <span className="note"> ({n.email})</span> : ''} {n.exact ? 'has the same name as' : 'looks like'} <b>{n.like}</b>, already in Hazdemy{n.likeEmail ? <span className="note"> ({n.likeEmail})</span> : <span className="note"> (no email yet)</span>}</span>
                  <span className="imp-namepick">
                    <label><input type="radio" name={'nr-' + n.row} checked={nameAns[n.row] === 'same'} onChange={() => setNameAns((m) => ({ ...m, [n.row]: 'same' }))} />Same person: update {n.like}’s profile</label>
                    <label><input type="radio" name={'nr-' + n.row} checked={nameAns[n.row] === 'new'} onChange={() => setNameAns((m) => ({ ...m, [n.row]: 'new' }))} />Different person: add a new profile</label>
                  </span>
                </li>
              ))}{checks.filter((n) => !n.likeId).map((n) => (
                <li key={n.name} className={nameAns[n.name] && !(nameAns[n.name] === 'fix' && !nameFix[n.name]?.trim()) ? '' : 'todo'}>
                  <span><b>“{n.name}”</b> <span className="note">on {n.courses} course{n.courses === 1 ? '' : 's'}</span> looks like <b>{n.like}</b>{n.likeKnown ? '' : <span className="note"> (also in this sheet)</span>}</span>
                  <span className="imp-namepick">
                    <label><input type="radio" name={'nm-' + n.name} checked={nameAns[n.name] === 'same'} onChange={() => setNameAns((m) => ({ ...m, [n.name]: 'same' }))} />Same person: use “{n.like}”</label>
                    <label><input type="radio" name={'nm-' + n.name} checked={nameAns[n.name] === 'new'} onChange={() => setNameAns((m) => ({ ...m, [n.name]: 'new' }))} />Different person</label>
                    <span className="imp-fix">
                      <label><input type="radio" name={'nm-' + n.name} checked={nameAns[n.name] === 'fix'} onChange={() => { setNameAns((m) => ({ ...m, [n.name]: 'fix' })); setNameFix((m) => ({ ...m, [n.name]: m[n.name] ?? n.like })); }} />Correct it to:</label>
                      <input type="text" className="imp-fix-in" aria-label={`Correct spelling for ${n.name}`} value={nameFix[n.name] ?? ''} placeholder={n.like}
                        onChange={(e) => { const v = e.target.value; setNameAns((m) => ({ ...m, [n.name]: 'fix' })); setNameFix((m) => ({ ...m, [n.name]: v })); }} />
                    </span>
                  </span>
                </li>
              ))}</ul>
            </section>
          )}
          {(preview.unknown?.length > 0 || addFields.length > 0) && (
            <section className="card imp-new-cols">
              <div className="imp-nc-head">
                <div><h2><Icon name="plus" small />New columns in this sheet</h2>
                  <p className="note" style={{ margin: 0 }}>Hazdemy doesn’t have {preview.unknown.length + addFields.length === 1 ? 'this column' : 'these columns'} yet. Tick one to add it as a new {isC ? 'course' : 'instructor'} field: its values are imported, and it shows on every {isC ? 'course page' : 'instructor'} from now on. Unticked columns are left out.</p></div>
                <div className="imp-nc-act">
                  <button type="button" className="btn sm" disabled={busy || !preview.unknown.length} onClick={() => setAdd([...addFields, ...preview.unknown.map((u) => u.header)])}>Add all</button>
                  <button type="button" className="btn sm" disabled={busy || !addFields.length} onClick={() => setAdd([])}>Add none</button>
                </div>
              </div>
              <div className="imp-nc-list">
                {[...(preview.customFields || []).filter((f) => f.isNew).map((f) => ({ header: f.label, on: true })), ...preview.unknown.map((u) => ({ ...u, on: false }))].map((u) => (
                  <label key={u.header} className={`imp-nc${u.on ? ' on' : ''}`} htmlFor={'nc-' + u.header}>
                    <input type="checkbox" id={'nc-' + u.header} checked={u.on} disabled={busy} onChange={() => flipAdd(u.header)} />
                    <span><b>{u.header}</b>{u.on ? <span className="note">Will be added as a field · shown in the table</span>
                      : <span className="note">{u.filled ? `${u.filled} row${u.filled === 1 ? '' : 's'} filled · e.g. ${u.samples.map((x) => `“${x.length > 30 ? x.slice(0, 30) + '…' : x}”`).join(', ')}` : 'Empty in every row'}</span>}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {total === 0 && preview.badCount > 0 && (() => {
            const count = (k) => preview.bad.filter((b) => b.kind === k).length, all = preview.badCount;
            const what = isC ? 'courses' : 'instructors', key = isC ? 'course code' : 'email';
            return (
              <div className="imp-alert" role="alert">
                <Icon name="shield" />
                <div>
                  <b>Nothing in this file can be imported.</b>
                  {count('exists') === all ? <p>All {all} {what} in this file are already in Hazdemy (matched by {key}). {isC ? 'To load this file again, tick “Replace all existing courses” above, or edit the courses one by one.' : 'Edit them on the Instructors page, or use a file with new instructors.'}</p>
                    : <p>{[count('missing') && `${count('missing')} rows have empty required cells`, count('invalid') && `${count('invalid')} have invalid values`, count('duplicate') && `${count('duplicate')} repeat an earlier row`, count('exists') && `${count('exists')} are already in Hazdemy`].filter(Boolean).join(', ')}. Fix rows on their tab below: type the missing value and click Add{count('missing') ? ', or tick rows on Missing data and import them anyway' : ''}. You can also fix them in Excel and choose the file again.</p>}
                </div>
              </div>
            );
          })()}
          {total > 0 && preview.badCount > 0 && <p className="note" style={{ margin: 0 }}>{preview.badCount} row{preview.badCount === 1 ? '' : 's'} can’t be imported yet. Open its tab (Missing data, Duplicate in file…), type the missing or correct value next to a row and click Add: it moves to Ready to import.</p>}
          {Object.keys(fixes).length > 0 && <p className="note" style={{ margin: 0 }}><Icon name="edit" small /> {Object.keys(fixes).length} row{Object.keys(fixes).length === 1 ? '' : 's'} fixed on this page (marked “Fixed”). Your spreadsheet isn’t changed, so update it too if you’ll import it again.</p>}
          {preview.noStatus > 0 && <p className="note" style={{ margin: 0 }}>{preview.noStatus} courses have no status and will be set to Pipeline.</p>}
          {preview.lessons?.orphan > 0 && <p className="note" style={{ margin: 0 }}>{preview.lessons.orphan} lesson rows refer to course codes that aren’t in Hazdemy or this file and will be skipped.</p>}
          {replace && <p className="note" style={{ margin: 0, color: 'var(--warn-ink)' }}>The {preview.existingCount} courses currently in Hazdemy will be removed.</p>}

          <div className="imp-bar">
            <div className="tabs" role="tablist" aria-label="Rows in the file">
              {[['good', 'check', `Ready to import`, total], ...Object.entries(KINDS).map(([k, [l, , ic]]) => [k, ic, l, preview.bad.filter((b) => b.kind === k).length]).filter(([, , , n]) => n), preview.lessons && ['lessons', 'book', 'Lessons', lessonCount]].filter(Boolean).map(([t, ic, l, n]) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setPage(1); setSort({ key: t === 'lessons' ? 'code' : 'row', dir: 1 }); }}><Icon name={ic} small />{l}<span className="n">{n}</span></button>
              ))}
            </div>
            <label className="field grow" htmlFor="impQ"><Icon name="search" small /><span className="sr">Search these rows</span>
              <input id="impQ" type="search" placeholder="Search these rows…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} autoComplete="off" /></label>
          </div>
          {tab === 'good' && total > 0 && (
            <div className="imp-sel">
              <span><b>{ready}</b> of {total} rows selected</span>
              <button type="button" className="btn sm" onClick={() => setRowsOn(preview.good, true)} disabled={ready === total}><Icon name="check" small />Select all rows</button>
              <button type="button" className="btn sm" onClick={() => setRowsOn(preview.good, false)} disabled={!ready}><Icon name="x" small />Deselect all rows</button>
              {q && rows.length > 0 && <button type="button" className="linkbtn" onClick={() => setRowsOn(rows, !rows.every((r) => selRows.has(r.row)))}>{rows.every((r) => selRows.has(r.row)) ? 'Deselect' : 'Select'} the {rows.length} matching “{q}”</button>}
              <span className="grow" />
              <div className="imp-colpick">
                <button type="button" className="btn sm" aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}><Icon name="list" small />Columns · {colKeys.length - offCols.size} of {colKeys.length}</button>
                {colsOpen && (
                  <div className="imp-colpop" role="group" aria-label="Columns to import">
                    <div className="imp-colact">
                      <button type="button" className="linkbtn" onClick={() => setOffCols(new Set())}>Select all</button>
                      <button type="button" className="linkbtn" onClick={() => setOffCols(new Set(colKeys.filter((k) => !need.includes(k))))}>Deselect all</button>
                      <button type="button" className="linkbtn" onClick={() => setColsOpen(false)}>Done</button>
                    </div>
                    {colKeys.map((k) => (
                      <label key={k} htmlFor={'col-' + k} title={need.includes(k) ? 'Always imported' : undefined}>
                        <input type="checkbox" id={'col-' + k} checked={!offCols.has(k)} disabled={need.includes(k)} onChange={() => flipCol(k)} />{labelOf(k)}{need.includes(k) && <span className="note"> (required)</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === 'missing' && rows.length > 0 && (
            <div className="imp-sel">
              <span><b>{selMissing.size}</b> of {preview.bad.filter((b) => b.kind === 'missing').length} rows selected</span>
              <button type="button" className="btn sm" onClick={() => flipMissing(preview.bad.filter((b) => b.kind === 'missing'), true)}><Icon name="check" small />Select all</button>
              <button type="button" className="btn sm" onClick={() => setSelMissing(new Set())} disabled={!selMissing.size}><Icon name="x" small />Deselect all</button>
              <span className="grow" />
              <span className="note">Fill in a value next to a row, or import rows as they are and add the details later.</span>
              <button type="button" className="btn sm primary" disabled={busy || !selMissing.size} onClick={() => importAnyway([...selMissing])}><Icon name="upload" small />Import {selMissing.size || ''} selected anyway</button>
            </div>
          )}
          {offCols.size > 0 && tab === 'good' && <p className="note" style={{ margin: 0 }}>{offCols.size} column{offCols.size === 1 ? '' : 's'} won’t be imported (shown greyed out): {[...offCols].map(labelOf).join(', ')}.</p>}
          <DataTable cols={cols} rows={rows} noun={tab === 'lessons' ? 'lessons' : isKind(tab) ? 'rows' : noun} sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
            page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
            empty={<EmptyState title={q ? 'No rows match your search' : isKind(tab) ? 'All sorted' : 'No rows here'} text={q ? 'Try another word, or clear the search.' : isKind(tab) ? KINDS[tab][3] : ''} />} />
          <div className="imp-foot"><span className="note">{ready} of {total} {noun} {lessonCount ? '(with the lessons of the selected courses) ' : ''}will be added{offCols.size ? `, leaving out ${offCols.size} unticked column${offCols.size === 1 ? '' : 's'}` : ''}{preview.badCount ? `; ${preview.badCount} rows with problems won’t` : ''}{force.length ? ` (${force.length} imported with missing data)` : ''}.</span>{importBtn}</div>
        </>
      )}
      {compare && preview && (() => {
        const dup = compare.kind === 'duplicate';
        const other = dup ? preview.good.find((g) => g.row === compare.dupOf) || preview.bad.find((b) => b.row === compare.dupOf) : null;
        // skipped rows hold the sheet's raw values: read them the way the import will ("Yes" under Travel is "Can Travel")
        const asImported = (k, v) => (k === 'travel' ? (/^(y|yes|willing)$/i.test(v) ? 'Can Travel' : /^(n|no)$/i.test(v) ? 'Virtual Only' : v) : v);
        const left = (k) => asImported(k, text(valueOf(compare, k))), right = (k) => asImported(k, text(dup ? (other ? valueOf(other, k) : '') : compare.existing?.[k]));
        const keys = colKeys.filter((k) => left(k) || right(k));
        const diff = keys.filter((k) => left(k).trim().toLowerCase() !== right(k).trim().toLowerCase());
        return (
          <Dialog open wide onClose={() => setCompare(null)} title={dup ? `Compare row ${compare.row} with row ${compare.dupOf}` : `Compare row ${compare.row} with Hazdemy`}
            subtitle={dup ? `Both rows have the same ${isC ? 'course code' : 'email'}, so only one can be imported.` : `This ${isC ? 'course' : 'instructor'} is already in Hazdemy. Importing doesn’t change what’s saved there.`}
            footer={<>
              <button className="btn" onClick={() => setCompare(null)}>Close</button>
              {!dup && compare.existingId && <Link className="btn" to={isC ? `/courses/${compare.existingId}` : `/instructors/${compare.existingId}`} target="_blank" rel="noopener"><Icon name="ext" small />Open in Hazdemy</Link>}
              {dup && <button className="btn primary" disabled={busy} onClick={() => useInstead(compare)}><Icon name="check" small />Import row {compare.row} instead</button>}
            </>}>
            <p className="note" style={{ margin: 0 }}>{diff.length ? `${diff.length} field${diff.length === 1 ? '' : 's'} differ${diff.length === 1 ? 's' : ''} (highlighted).` : 'Every field is the same: the rows are exact copies.'}{dup && ` Row ${compare.dupOf} is the one imported now.`}</p>
            <div className="tscroll imp-cmp"><table>
              <thead><tr><th>Field</th><th>Row {compare.row}{dup ? ' (this row)' : ' in your file'}</th><th>{dup ? `Row ${compare.dupOf}` : 'In Hazdemy now'}</th></tr></thead>
              <tbody>{keys.map((k) => (
                <tr key={k} className={diff.includes(k) ? 'diff' : ''}>
                  <th scope="row">{labelOf(k)}{diff.includes(k) && <span className="pill warn">Different</span>}</th>
                  <td>{left(k) || <span className="note">—</span>}</td><td>{right(k) || <span className="note">—</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </Dialog>
        );
      })()}
      <InstructorAccounts accounts={accounts} onClose={() => { setAccounts(null); nav(back); }} />
    </>
  );
}
