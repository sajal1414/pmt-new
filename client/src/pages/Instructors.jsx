import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Confirm, DataTable, Dialog, Field, Feedback, PageHead, EmptyState, Dash, sortRows, downloadText, toCSV } from '../components/ui.jsx';
import RaterList from '../components/RaterList.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { TRAVEL, uniq, splitList, initials } from '../lib/constants.js';
import SignaturePad from '../teach/SignaturePad.jsx';
import { useCustomFields } from '../lib/customFields.js';
import InstructorAccounts, { TempPassword } from '../components/InstructorAccounts.jsx';
import LanguagePicker from '../components/LanguagePicker.jsx';
import BulkAssign from '../components/BulkAssign.jsx';

const EXPORT_KEYS = ['name', 'email', 'phone', 'location', 'platforms', 'portfolio', 'product', 'skills', 'canTeach', 'qualified', 'vendor', 'travel', 'languages', 'comments'];
const FIELDS = [
  ['name', 'Name', 'text', '', true], ['email', 'Email', 'email'], ['phone', 'Telephone', 'tel', '', false, 'e.g. +91 98765 43210'], ['location', 'Location'], ['travel', 'Travel preference', 'select'], ['vendor', 'Vendor'],
  ['platformsText', 'Platform', 'text', '', false, 'e.g. Data & AI, Security'], ['portfolio', 'Portfolio'], ['product', 'Product'],
  ['skills', 'Skills / products', 'text', 'full', false, 'watsonx Orchestrate, DataStage, …'], 
  ['languages', 'Delivery languages', 'text', '', false, 'e.g. English, German'], ['comments', 'Comments', 'textarea', 'full']
];

/**
 * The instructor details and form show as a pop-up (Courses page, course editor) or as a page of their own
 * (/instructors/:id and /instructors/:id/edit): same content, only the frame differs.
 */
function Frame({ page, back, open = true, title, subtitle, onClose, footer, wide, children }) {
  if (!page) return <Dialog open={open} wide={wide} title={title} subtitle={subtitle} onClose={onClose} footer={footer}>{children}</Dialog>;
  return (
    <>
      <Link to={back.to} className="back" style={{ alignSelf: 'flex-start' }}><Icon name="back" small />{back.label}</Link>
      <PageHead eyebrow="Instructor" title={title} summary={subtitle && <span className="note">{subtitle}</span>} actions={footer} />
      <section className="card">{children}</section>
      {footer && <div className="actions" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>{footer}</div>}
    </>
  );
}

// names that are probably the same person: the same letters ("ArturoSantos"), a typo or swapped letters
// ("Mansih Ladha"), one name inside the other ("Dan Ani Manish Ladha"), or the same email
const nameKey = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
function editDistance(a, b) { // insertions, deletions, changes and swaps of neighbouring letters
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
const lookAlike = (x, y) => {
  if (x.email && y.email && x.email.toLowerCase() === y.email.toLowerCase()) return true;
  const a = nameKey(x.name), b = nameKey(y.name), short = Math.min(a.length, b.length);
  if (!a || !b) return false;
  return a === b || (short >= 6 && editDistance(a, b) <= 2) || (short >= 8 && (a.includes(b) || b.includes(a)));
};

/**
 * A list of courses on an instructor's profile ("Course Author", "Qualified to teach"): pick courses from ATLAS.
 * Stored as course codes; anything typed by hand that isn't a course is kept. `onAssign`: also offer to assign the
 * instructor to newly added courses (only where the list means they teach them).
 */
function CoursePicker({ id = 'cpick', label, hint, value, onChange, instructorName, assign, onAssign, initial }) {
  const { courses } = useData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, []);
  const find = (t) => courses.find((c) => c.code.toLowerCase() === t.toLowerCase() || c.name.toLowerCase() === t.toLowerCase());
  const items = splitList(value).filter(Boolean);
  const has = (c) => items.some((t) => find(t)?.id === c.id);
  const toggle = (c) => onChange((has(c) ? items.filter((t) => find(t)?.id !== c.id) : [...items, c.code]).join(', '));
  const drop = (t) => onChange(items.filter((x) => x !== t).join(', '));
  const before = new Set(splitList(initial).map((t) => find(t)?.id).filter(Boolean));
  const fresh = items.map(find).filter((c) => c && !before.has(c.id) && !(c.instructors || []).some((n) => n.toLowerCase() === (instructorName || '').trim().toLowerCase()));
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return courses.filter((c) => !t || [c.code, c.name, c.platform, c.product].join(' ').toLowerCase().includes(t)).sort((a, b) => a.code.localeCompare(b.code));
  }, [courses, q]);
  return (
    <div className="fg full">
      <label htmlFor={id + 'Q'}>{label}</label>{hint && <span className="note" style={{ marginTop: -2 }}>{hint}</span>}
      <div className="assigned">
        {items.length ? items.map((t) => { const c = find(t); return (
          <span key={t} className={`ichip${c ? '' : ' ext'}`} title={c ? c.name : 'Not a course in Hazdemy'}>{c ? <><span className="code">{c.code}</span> {c.name}</> : t}
            <button type="button" onClick={() => drop(t)} aria-label={'Remove ' + t}><Icon name="x" small /></button></span>
        ); }) : <span className="note">No courses yet.</span>}
      </div>
      <div className="picker" ref={box}>
        <label className="pick-in" htmlFor={id + 'Q'}><Icon name="search" small /><span className="sr">Add courses to {label}</span>
          <input id={id + 'Q'} placeholder="Search courses by code, name, platform or product…" autoComplete="off" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          {q && <button type="button" className="linkbtn" onClick={() => setQ('')}>Clear</button>}
        </label>
        {open && (
          <div className="pick-pop">
            <div className="pick-list">
              {matches.length ? matches.map((c) => (
                <label key={c.id} htmlFor={id + '-' + c.id}>
                  <input type="checkbox" id={id + '-' + c.id} checked={has(c)} onChange={() => toggle(c)} />
                  <span className="who2"><b><span className="code">{c.code}</span> {c.name}</b><span>{[c.platform, c.product, c.status].filter(Boolean).join(' • ')}{(c.instructors || []).length ? ` • Taught by ${c.instructors.join(', ')}` : ' • No instructor yet'}</span></span>
                </label>
              )) : <p className="note" style={{ padding: 14, margin: 0 }}>No courses match “{q}”.</p>}
            </div>
            <div className="pick-foot"><span>{items.length} selected</span><button type="button" className="btn sm primary" onClick={() => setOpen(false)}>Done</button></div>
          </div>
        )}
      </div>
      {onAssign && fresh.length > 0 && (
        <label className="cp-assign"><input type="checkbox" checked={assign} onChange={(e) => onAssign(e.target.checked)} />
          <span>Also assign {instructorName?.trim() || 'this instructor'} as instructor on the {fresh.length} newly added course{fresh.length === 1 ? '' : 's'} ({fresh.map((c) => c.code).join(', ')})</span></label>
      )}
    </div>
  );
}

/**
 * The instructor form: a pop-up (new instructor, course editor, Courses page) or, with `page`, the instructor's own page
 * at /instructors/:id: every field editable in place, "Save changes" when something changed, and it stays on the page
 * after saving. `onDirty(bool)` tells the page about unsaved changes (it asks before leaving).
 */
export function InstructorForm({ open, record, preset, onClose, onSaved, page, onDelete, onDirty }) {
  const { reload, instructors } = useData();
  const toast = useToast();
  const [f, setF] = useState({});
  const [base, setBase] = useState({}); // the saved values, to tell whether anything changed
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [assign, setAssign] = useState(true);
  const [sig, setSig] = useState(null); // the instructor's certificate signature (edit only), loaded on open
  const custom = useCustomFields().instructors;
  const { courses } = useData();
  const fill = (r) => {
    const v = r ? { ...r, canTeach: r.canTeach || '', qualified: r.qualified || '', password: '', platformsText: (r.platforms || []).join(', ') } : { vendor: 'IBM', ...preset };
    // on the page the course lists are edited (and saved) in the Courses panel, so the form leaves them alone
    if (page) { delete v.canTeach; delete v.qualified; }
    setF(v); setBase(v); setErr({}); setAssign(true);
  };
  useEffect(() => { setSig(null); if (open && record) api.get(`/api/instructors/${record.id}/signature`).then((r) => setSig(r.signature || '')).catch(() => setSig('')); }, [open, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // refill when a different instructor is opened (not on every data reload, which would wipe unsaved typing)
  useEffect(() => { if (open) fill(record); }, [open, record?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!record && JSON.stringify(f) !== JSON.stringify(base);
  useEffect(() => { onDirty?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const [accounts, setAccounts] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    // courses newly ticked under "Qualified to teach": the server adds the instructor to any that don't list them yet
    // (being a Course Author means owning the content, not teaching it, so that list doesn't assign anyone)
    const find = (t) => courses.find((c) => c.code.toLowerCase() === t.toLowerCase() || c.name.toLowerCase() === t.toLowerCase());
    const before = new Set(splitList(record?.qualified).map((t) => find(t)?.id).filter(Boolean));
    const fresh = page ? [] : splitList(f.qualified).map(find).filter((c) => c && !before.has(c.id));
    const { accounts: _a, ...fields } = f; // (never send back a previous sign-in reply)
    const body = { ...fields, platforms: splitList(f.platformsText), assign: assign ? fresh.map((c) => c.id) : [] };
    try {
      const saved = record ? await api.put('/api/instructors/' + record.id, body) : await api.post('/api/instructors', body);
      if (page) fill(saved); // the page stays open, showing what was saved
      await reload(); toast((record ? 'Saved ' : 'Created ') + f.name); onSaved?.(saved);
      if (saved.accounts?.length) setAccounts(saved.accounts); // a new sign-in (temporary password)
      if (!page) onClose();
    } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  const formEl = (
      <form id="instrForm" className="form" noValidate onSubmit={submit}>
        {FIELDS.map(([k, label, type = 'text', cls = '', req = false, ph]) => (
          <Field key={k} id={'in-' + k} label={label} type={type} options={type === 'select' ? TRAVEL : undefined} className={cls} required={req} placeholder={ph}
            value={f[k]} error={err[k]} onChange={(v) => setF((s) => ({ ...s, [k]: v }))} />
        )).flatMap((el) => {
          // on the page: the fields in groups; the course lists live in the Courses panel instead
          // Delivery languages: a picker with a list of languages (still saved as "English, Hindi")
          if (el.key === 'languages') el = <LanguagePicker key="languages" id="in-languages" value={f.languages} onChange={(v) => setF((s) => ({ ...s, languages: v }))} />;
          if (page) { const head = { name: ['user', 'Contact'], platformsText: ['layers', 'Expertise'], comments: ['msg', 'Notes'] }[el.key]; return head ? [<h3 key={'h-' + el.key} className="full iv-sec"><Icon name={head[0]} small />{head[1]}</h3>, el] : [el]; }
          return el.key === 'skills' ? [el,
            <CoursePicker key="canTeach" id="cpAuthor" label="Course Author" hint="Courses whose content they own." value={f.canTeach} initial={record?.canTeach} instructorName={f.name}
              onChange={(v) => setF((s) => ({ ...s, canTeach: v }))} />,
            <CoursePicker key="qualified" id="cpQualified" label="Qualified to teach" hint="Courses they can teach, without necessarily owning the content." value={f.qualified} initial={record?.qualified} instructorName={f.name}
              assign={assign} onAssign={setAssign} onChange={(v) => setF((s) => ({ ...s, qualified: v }))} />] : [el];
        })}
        {page && <h3 className="full iv-sec"><Icon name="lock" small />Sign-in &amp; certificate</h3>}
        <TempPassword id="in-password" label={record ? 'Sign-in: new temporary password' : 'Sign-in: temporary password'} value={f.password} onChange={(v) => setF((s) => ({ ...s, password: v }))} error={err.password}
          placeholder={record ? 'Leave blank to keep their current password' : 'Leave blank to make one automatically'} />
        {!record && f.name && (() => { const like = instructors.find((o) => lookAlike({ name: f.name, email: f.email }, o)); return like && <p className="note full dup-q"><Icon name="alert" small />This looks like <b>{like.name}</b>{like.email ? ` (${like.email})` : ''}, who’s already in Hazdemy. Make sure it isn’t the same person.</p>; })()}
        {custom.map((c) => (
          <Field key={c.key} id={'in-' + c.key} label={c.label} value={f.extra?.[c.key] || ''} onChange={(v) => setF((s) => ({ ...s, extra: { ...(s.extra || {}), [c.key]: v } }))} />
        ))}
      </form>
  );
  const sigEl = record && sig !== null && (
    <SignaturePad bare endpoint={`/api/instructors/${record.id}/signature`} preview={`/api/instructors/${record.id}/certificate-preview`} value={sig}
      note={`Printed above ${record.name}’s name on their course certificates. Saved as soon as you save it here.`} onSaved={(s) => { setSig(s); reload(); }} />
  );
  const footer = page
    ? <>{onDelete && <button type="button" className="btn danger-o" onClick={onDelete}><Icon name="trash" small />Delete</button>}
        {dirty && <button type="button" className="btn" onClick={() => fill(record)} disabled={busy}>Discard changes</button>}
        <button className="btn primary" type="submit" form="instrForm" disabled={busy || !dirty}><Icon name="save" small />{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button></>
    : <><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="instrForm" disabled={busy}><Icon name="save" small />{busy ? 'Saving…' : record ? 'Save changes' : 'Create instructor'}</button></>;
  return (
    <>
    <Frame page={page} back={{ to: '/instructors', label: 'Instructors' }} open={open} onClose={onClose} footer={footer}
      title={page && record ? record.name : record ? 'Edit instructor' : 'New instructor'}
      subtitle={page && record ? [record.email || 'No email yet', (record.platforms || []).join(', '), record.location].filter(Boolean).join(' · ') : record ? record.email || 'No email yet' : 'Only the name is required. Add an email so they can sign in.'}>
      {page && record
        ? <>
            {/* the instructor's page: their details to edit on the left, the courses they're assigned to on the right */}
            <div className="iv-cols"><div className="iv-left">{dirty && <p className="note iv-unsaved" role="status"><Icon name="alert" small />You have unsaved changes.</p>}{formEl}{sigEl}</div>
              <aside className="iv-right"><CoursesPanel x={record} /></aside></div>
            <WhoRated x={record} />
          </>
        : <>{formEl}{sigEl}</>}
    </Frame>
    <InstructorAccounts accounts={accounts} onClose={() => setAccounts(null)} />
    </>
  );
}

export function InstructorView({ x: given, onClose, onEdit, focusRated, page, onDelete }) {
  const leave = page ? undefined : onClose; // following a link closes the pop-up; on a page there is nothing to close
  const { courses, ratings } = useData();
  const custom = useCustomFields().instructors;
  // a name used on courses but missing from the instructor list: build what we can from those courses
  const missing = !!given && !given.id;
  const taught = given ? courses.filter((c) => (c.instructors || []).some((n) => n.trim().toLowerCase() === given.name.trim().toLowerCase())) : [];
  const x = missing ? { ...given, platforms: uniq(taught.map((c) => c.platform).filter(Boolean)), product: uniq(taught.map((c) => c.product).filter(Boolean)).join(', '), skills: uniq(taught.map((c) => c.product).filter(Boolean)).join(', '),
    canTeach: '', qualified: taught.map((c) => c.code).join(', '), vendor: uniq(taught.map((c) => c.vendor).filter(Boolean)).join(', '), rating: '' } : given;
  const rated = missing ? taught.map((c) => ratings.courses[c.id]).filter(Boolean) : [];
  const lr = !x ? null : missing ? (rated.length ? { avg: rated.reduce((a, r) => a + r.avg * r.count, 0) / rated.reduce((a, r) => a + r.count, 0), count: rated.reduce((a, r) => a + r.count, 0) } : null) : ratings.instructors[x.id];
  useEffect(() => { if (given && focusRated) setTimeout(() => document.getElementById('who-rated')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }, [given, focusRated]);
  if (!x) return page ? null : <Dialog open={false} onClose={onClose} />;
  const skills = splitList(x.skills);
  const Tile = ({ icon, label, children }) => <div className="tile"><span>{icon && <Icon name={icon} small />} {label}</span><b>{children}</b></div>;
  return (
    <Frame page={page} back={{ to: '/instructors', label: 'Instructors' }} wide title={page ? x.name : 'Instructor details'} subtitle={page ? [(x.platforms || []).join(', '), x.location].filter(Boolean).join(' · ') : ''} onClose={onClose}
      footer={<>{page ? onDelete && <button className="btn danger-o" onClick={onDelete}><Icon name="trash" small />Delete</button> : <button className="btn" onClick={onClose}>Close</button>}<button className="btn primary" onClick={onEdit}><Icon name={missing ? 'plus' : 'edit'} small />{missing ? 'Add to instructor list' : 'Edit'}</button></>}>
      {/* on the page: details on the left, the courses they're assigned to on the right (stacked on narrow screens) */}
      {(() => { const details = (<>
      {missing && <div className="iv-missing"><Icon name="alert" small /><span><b>{x.name}</b> teaches {taught.length} course{taught.length === 1 ? '' : 's'} but isn’t in the instructor list yet, so email, phone and other details are missing. The details below come from their courses. Click <b>Add to instructor list</b> to save a full profile.</span></div>}
      <div className="iv-head"><span className="iv-av">{initials(x.name)}</span>
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>{x.name}</div>
          <div className="note" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{x.email ? <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', userSelect: 'all' }}><Icon name="mail" small />{x.email}</span> : <span>No email yet</span>}{x.phone && <a href={'tel:' + x.phone.replace(/[^\d+]/g, '')} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="phone" small />{x.phone}</a>}{x.location && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Icon name="pin" small />{x.location}</span>}</div></div>
      </div>
      <div className="box">
        <h4><Icon name="layers" small />Platform &amp; products teaching authorization</h4>
        <div className="tiles"><Tile label="Primary platform">{(x.platforms || []).join(', ') || '—'}</Tile><Tile label="Primary product">{x.product || '—'}</Tile></div>
        {x.portfolio && <div className="note"><b style={{ color: 'var(--ink-2)' }}>Portfolio:</b> {x.portfolio}</div>}
        <div><div className="note" style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>Skills &amp; products breakdown</div>
          <div className="chips">{skills.length ? skills.map((s) => <span key={s} className="chip">{s}</span>) : <span className="note">None listed</span>}</div></div>
        <div><div className="note" style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>Course Author</div>
          <div className="tile" style={{ fontSize: 13 }}>{x.canTeach || <span className="note">Not specified</span>}</div></div>
        <div><div className="note" style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>Qualified to teach</div>
          <div className="tile" style={{ fontSize: 13 }}>{(() => { const all = [...new Set([...splitList(x.qualified || ''), ...taught.map((c) => c.code)].filter(Boolean))]; return all.length ? all.join(', ') : <span className="note">Not specified</span>; })()}</div></div>
      </div>
      <div className="tiles">
        <Tile icon="phone" label="Telephone">{x.phone ? <a href={'tel:' + x.phone.replace(/[^\d+]/g, '')}>{x.phone}</a> : <span className="note">Not added. Click {missing ? 'Add to instructor list' : 'Edit'} to add one.</span>}</Tile>
        <Tile icon="badge" label="Vendor alignment">{x.vendor || '—'}</Tile>
        <Tile icon="plane" label="Travel preference">{x.travel || '—'}</Tile>
        <Tile icon="user" label="Learner rating">{lr ? <><Feedback rating={lr.avg} /> <span className="note">({lr.count} review{lr.count === 1 ? '' : 's'})</span></> : <span className="note">No reviews yet</span>}</Tile>
      </div>
      <Tile icon="globe" label="Delivery languages">{x.languages || '—'}</Tile>
      <Tile icon="msg" label="Notes & faculty comments">{x.comments || '—'}</Tile>
      {custom.length > 0 && <div className="tiles">{custom.map((c) => <Tile key={c.key} label={c.label}>{x.extra?.[c.key] || '—'}</Tile>)}</div>}
      </>);
      return page
        ? <div className="iv-cols"><div className="iv-left">{details}</div><aside className="iv-right"><AssignedCourses name={x.name} all /></aside></div>
        : <>{details}<AssignedCourses name={x.name} leave={leave} /></>; })()}
      {!missing && <WhoRated x={x} leave={leave} />}
    </Frame>
  );
}

/**
 * The courses an instructor is assigned to in Hazdemy (details pop-up, and the side column of their page).
 * `all`: list every one. `editable` (their page): add them to another course, or remove them from one; this saves
 * straight away on the course (who teaches a course lives on the course), separately from "Save changes".
 */
function AssignedCourses({ name, leave, all, editable }) {
  const { courses, reload } = useData();
  const toast = useToast();
  const same = (n) => n.trim().toLowerCase() === name.trim().toLowerCase();
  const taught = courses.filter((c) => (c.instructors || []).some(same));
  const shown = all ? taught : taught.slice(0, 8);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [remove, setRemove] = useState(null); // the course to take them off, while confirming
  const box = useRef(null);
  useEffect(() => {
    if (!editable) return undefined;
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [editable]);
  const s = q.trim().toLowerCase();
  const addable = editable ? courses.filter((c) => !(c.instructors || []).some(same) && (!s || [c.code, c.name, c.platform, c.product, c.customFor].join(' ').toLowerCase().includes(s))).slice(0, 30) : [];
  const assign = async (c, on) => {
    setBusy(c.id);
    try {
      const list = on ? [...(c.instructors || []), name] : (c.instructors || []).filter((n) => !same(n));
      await api.put('/api/courses/' + c.id, { instructors: list });
      await reload(['courses', 'activity', 'ratings']);
      toast(on ? `${name} added to ${c.code}` : `${name} removed from ${c.code}`);
      if (on) { setQ(''); setOpen(false); }
    } catch (x) { toast(x.message); } finally { setBusy(''); setRemove(null); }
  };
  return (
    <div className={`tile${all ? ' iv-courses' : ''}`}><span>Assigned in Hazdemy ({taught.length})</span>
      {editable && (
        <div className="picker iv-add" ref={box}>
          <label className="pick-in" htmlFor="ivAddQ"><Icon name="plus" small /><span className="sr">Add {name} to a course</span>
            <input id="ivAddQ" placeholder="Add to a course: search code or name…" autoComplete="off" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} /></label>
          {open && (
            <div className="pick-pop"><div className="pick-list" role="listbox" aria-label="Courses to add">
              {addable.length ? addable.map((c) => (
                <button key={c.id} type="button" className="iv-opt" disabled={!!busy} onClick={() => assign(c, true)}>
                  <span className="code">{c.code}</span><span className="iv-opt-n">{c.name}{c.customFor && <span className="note"> · for {c.customFor}</span>}</span>
                  <span className="iv-opt-a">{busy === c.id ? 'Adding…' : <><Icon name="plus" small />Add</>}</span>
                </button>
              )) : <p className="note" style={{ padding: 14, margin: 0 }}>{s ? `No other course matches “${q}”.` : `${name} is on every course.`}</p>}
            </div></div>
          )}
        </div>
      )}
      <div className={editable ? 'iv-clist' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {taught.length ? shown.map((c) => (
          <div key={c.id} className={editable ? 'iv-crow' : undefined} style={editable ? undefined : { display: 'contents' }}>
            <Link to={'/courses/' + c.id} onClick={leave}><span className="code">{c.code}</span> {c.name}</Link>
            {editable && <button type="button" className="iv-rm" onClick={() => setRemove(c)} disabled={!!busy} aria-label={`Remove ${name} from ${c.code}`} title={`Remove from ${c.code}`}><Icon name="x" small /></button>}
          </div>
        )) : <span className="note">No courses assigned yet</span>}
        {taught.length > shown.length && <Link to={'/courses?instructor=' + encodeURIComponent(name)} onClick={leave} className="linkbtn" style={{ alignSelf: 'flex-start', fontSize: 13 }}>+{taught.length - 8} more · see all {taught.length} on Courses →</Link>}
      </div>
      {editable && <Confirm open={!!remove} busy={busy === remove?.id} title="Remove from this course?" confirmLabel="Remove"
        message={remove ? `${name} will no longer be an instructor of ${remove.code} ${remove.name}.${(remove.schedules || []).some((b) => b.instructor && same(b.instructor)) ? ' Batches they run on it keep their name until you change them on the course.' : ''}` : ''}
        onClose={() => setRemove(null)} onConfirm={() => assign(remove, false)} />}
    </div>
  );
}

/* ---------- the instructor page's "Courses" panel: Teaching · Qualified to teach · Course Author ---------- */
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// in tab order; each list has its own colour (tab, count, badges): Teaching green, Author blue, Qualified amber
const LISTS = {
  teaching: { tab: 'Teaching', icon: 'book', blurb: 'Courses they’re assigned to in Hazdemy: they appear in their portal, schedule and certificates.', empty: 'Not teaching any course yet.', add: 'Assign to a course…' },
  author: { tab: 'Author', icon: 'edit', blurb: 'Courses whose content they own.', empty: 'No courses listed yet.', add: 'Add a course they own…' },
  qualified: { tab: 'Qualified', icon: 'badge', blurb: 'Courses they can teach, without necessarily owning the content. Every course they teach counts automatically.', empty: 'No courses listed yet.', add: 'Add a course they can teach…' }
};

/**
 * Who teaches a course lives on the course; "Qualified to teach" and "Course Author" are lists of course codes on the
 * instructor. All three save straight away. Badges show how the lists relate, and a qualified course they don't teach
 * yet has an Assign button.
 */
function CoursesPanel({ x }) {
  const { courses, reload } = useData();
  const toast = useToast();
  const [tab, setTab] = useState('teaching');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [remove, setRemove] = useState(null); // { key, course|text } while confirming
  const box = useRef(null);
  useEffect(() => {
    const out = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => { setQ(''); setOpen(false); }, [tab]);
  const byCode = (t) => courses.find((c) => sameName(c.code, t) || sameName(c.name, t));
  const teaching = courses.filter((c) => (c.instructors || []).some((n) => sameName(n, x.name)));
  const codes = { qualified: splitList(x.qualified).filter(Boolean), author: splitList(x.canTeach).filter(Boolean) };
  const isTeaching = (c) => teaching.some((t) => t.id === c.id);
  // authorship comes from the server (`authors` on each course): the Author list, or the course's imported author text
  const authoring = courses.filter((c) => (c.authors || []).some((n) => sameName(n, x.name)));
  const isAuthoring = (c) => authoring.some((a) => a.id === c.id);
  const inList = (key, c) => (key === 'author' ? isAuthoring(c) : codes[key].some((t) => byCode(t)?.id === c.id));
  // each list as rows: { key, c (course or null), text (what's stored) }
  const rows = {
    teaching: teaching.map((c) => ({ key: c.id, c })),
    author: [...authoring.map((c) => ({ key: c.id, c })), ...codes.author.filter((t) => !byCode(t)).map((t) => ({ key: t, c: null, text: t }))],
    // qualified: the courses added by hand, plus every course they teach (teaching one means they're qualified for it)
    qualified: [...codes.qualified.map((t) => ({ key: t, c: byCode(t) || null, text: t })),
      ...teaching.filter((c) => !codes.qualified.some((t) => byCode(t)?.id === c.id)).map((c) => ({ key: 'teach-' + c.id, c, viaTeaching: true }))]
      .sort((a, b) => String(a.c?.code || a.text).localeCompare(String(b.c?.code || b.text)))
  };
  // a course's authors are set on the course, which keeps every instructor's Author list in step
  const setAuthor = async (c, on) => {
    const list = on ? [...(c.authors || []), x.name] : (c.authors || []).filter((n) => !sameName(n, x.name));
    await api.put(`/api/courses/${c.id}/authors`, { authors: list, keepText: true });
    await reload(['courses', 'instructors', 'activity']); toast(on ? `${c.code} added to Course Author` : `${c.code} removed from Course Author`);
  };
  const field = { qualified: 'qualified', author: 'canTeach' };
  const saveList = async (key, list, msg) => {
    await api.put('/api/instructors/' + x.id, { [field[key]]: list.join(', ') });
    await reload(['instructors', 'activity']); toast(msg);
  };
  const setTeaching = async (c, on) => {
    const list = on ? [...(c.instructors || []), x.name] : (c.instructors || []).filter((n) => !sameName(n, x.name));
    await api.put('/api/courses/' + c.id, { instructors: list });
    await reload(['courses', 'activity', 'ratings']); toast(on ? `${x.name} assigned to ${c.code}` : `${x.name} removed from ${c.code}`);
  };
  const run = async (id, fn) => { setBusy(id); try { await fn(); } catch (e) { toast(e.message); } finally { setBusy(''); } };
  const add = (c) => run(c.id, async () => {
    if (tab === 'teaching') await setTeaching(c, true);
    else if (tab === 'author') await setAuthor(c, true);
    else await saveList(tab, [...codes[tab], c.code], `${c.code} added to Qualified to teach`);
    setQ(''); setOpen(false);
  });
  const drop = (r) => run(r.key, async () => {
    if (tab === 'teaching') await setTeaching(r.c, false);
    else if (tab === 'author' && r.c) await setAuthor(r.c, false);
    else await saveList(tab, codes[tab].filter((t) => t !== r.text), `${r.text} removed from ${tab === 'author' ? 'Course Author' : 'Qualified to teach'}`);
    setRemove(null);
  });
  const s = q.trim().toLowerCase();
  const already = (c) => (tab === 'teaching' ? isTeaching(c) : tab === 'qualified' ? inList('qualified', c) || isTeaching(c) : inList(tab, c));
  const addable = courses.filter((c) => !already(c) && (!s || [c.code, c.name, c.platform, c.product, c.customFor].join(' ').toLowerCase().includes(s))).slice(0, 30);
  const L = LISTS[tab];
  const badges = (c) => c && [
    tab !== 'teaching' && isTeaching(c) && <span key="t" className="iv-b iv-c-teaching">Teaching</span>,
    tab !== 'author' && inList('author', c) && <span key="a" className="iv-b iv-c-author">Author</span>,
    tab !== 'qualified' && inList('qualified', c) && <span key="q" className="iv-b iv-c-qualified">Qualified</span>
  ].filter(Boolean);
  return (
    <section className={`iv-panel iv-c-${tab}`} aria-label="Courses">
      <div className="iv-tabs" role="tablist">
        {Object.entries(LISTS).map(([k, v]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`iv-c-${k}${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
            <Icon name={v.icon} small />{v.tab}<span className="n">{rows[k].length}</span></button>
        ))}
      </div>
      <p className="note iv-blurb">{L.blurb}</p>
      <div className="picker iv-add" ref={box}>
        <label className="pick-in" htmlFor="ivAddQ"><Icon name="plus" small /><span className="sr">{L.add}</span>
          <input id="ivAddQ" placeholder={L.add} autoComplete="off" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} /></label>
        {open && (
          <div className="pick-pop"><div className="pick-list" role="listbox" aria-label="Courses to add">
            {addable.length ? addable.map((c) => (
              <button key={c.id} type="button" className="iv-opt" disabled={!!busy} onClick={() => add(c)}>
                <span className="code">{c.code}</span><span className="iv-opt-n">{c.name}{c.customFor && <span className="note"> · for {c.customFor}</span>}</span>
                <span className="iv-opt-a">{busy === c.id ? 'Adding…' : <><Icon name="plus" small />Add</>}</span>
              </button>
            )) : <p className="note" style={{ padding: 14, margin: 0 }}>{s ? `No other course matches “${q}”.` : 'Every course is already in this list.'}</p>}
          </div></div>
        )}
      </div>
      <div className="iv-clist" role="tabpanel">
        {rows[tab].length ? rows[tab].map((r) => (
          <div key={r.key} className={`iv-crow${r.c ? '' : ' ext'}`}>
            {r.c ? <Link to={'/courses/' + r.c.id}><span className="code">{r.c.code}</span><span>{r.c.name}</span></Link>
              : <span className="iv-ext" title="Not a course in Hazdemy"><span className="code">?</span><span>{r.text}</span></span>}
            <span className="iv-crow-end">
              {badges(r.c)}
              {tab === 'qualified' && r.c && !isTeaching(r.c) && <button type="button" className="btn sm iv-assign" disabled={!!busy} onClick={() => run(r.key, () => setTeaching(r.c, true))}>{busy === r.key ? 'Assigning…' : 'Assign'}</button>}
              {r.viaTeaching ? <span className="iv-rm iv-lock" title="Qualified because they teach this course. Remove it from Teaching to take it off."><Icon name="lock" small /></span>
                : <button type="button" className="iv-rm" disabled={!!busy} onClick={() => setRemove(r)} aria-label={`Remove ${r.c?.code || r.text}`} title="Remove"><Icon name="x" small /></button>}
            </span>
          </div>
        )) : <div className="iv-empty"><Icon name={L.icon} /><span>{L.empty}</span></div>}
      </div>
      <Confirm open={!!remove} busy={!!busy} confirmLabel="Remove"
        title={tab === 'teaching' ? 'Remove from this course?' : `Remove from ${tab === 'author' ? 'Course Author' : 'Qualified to teach'}?`}
        message={!remove ? '' : tab === 'teaching'
          ? `${x.name} will no longer be an instructor of ${remove.c.code} ${remove.c.name}.${(remove.c.schedules || []).some((b) => b.instructor && sameName(b.instructor, x.name)) ? ' Batches they run on it keep their name until you change them on the course.' : ''}`
          : `${remove.c ? `${remove.c.code} ${remove.c.name}` : remove.text} is taken off this list. It doesn’t change who teaches the course.`}
        onClose={() => setRemove(null)} onConfirm={() => drop(remove)} />
    </section>
  );
}

/** Every learner review of an instructor, with who wrote it. */
function WhoRated({ x, leave }) {
  const { ratings } = useData();
  const lr = ratings.instructors[x.id];
  return (
    <div className="box" id="who-rated">
      <h4><Icon name="star" small />Who rated {x.name.split(' ')[0]}{lr ? ` (${lr.count})` : ''}</h4>
      <RaterList by={{ instructor: x.id }} onOpenCourse={leave} />
    </div>
  );
}

export default function Instructors() {
  const { instructors, courses, ratings, reload } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [vendor, setVendor] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [form, setForm] = useState(null); // { record }
  const [del, setDel] = useState(null);
  const nav = useNavigate();
  useEffect(() => { // dashboard quick action: /instructors?new=1
    if (!params.get('new')) return;
    // ?name= comes from an instructor named on a course but missing from this list
    setForm({ record: null, preset: params.get('name') ? { name: params.get('name') } : {} }); const p = new URLSearchParams(params); p.delete('new'); p.delete('name'); setParams(p, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // older links (/instructors?view=<id>, from search, imports and reports) now open the instructor's own page
  useEffect(() => {
    const id = params.get('view');
    if (id) nav(`/instructors/${encodeURIComponent(id)}${params.get('rated') === '1' ? '?rated=1' : ''}`, { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortRows(instructors.filter((x) => (!s || [x.name, x.email, x.phone, (x.platforms || []).join(' '), x.product, x.skills, x.canTeach, x.qualified, x.location].join(' ').toLowerCase().includes(s))
      && (!platform || (x.platforms || []).includes(platform)) && (!vendor || x.vendor === vendor)), sort, (x, k) => (k === 'learner' ? ratings.instructors[x.id]?.avg : x[k]));
  }, [instructors, ratings, q, platform, vendor, sort]);
  const active = q || platform || vendor;
  const cols = [
    { key: 'name', label: 'Name & contact', sortable: true, render: (x) => <span className="two"><Link className="rowlink" to={`/instructors/${x.id}`} title={`Open ${x.name}’s page`}><b style={{ color: 'var(--ink)' }}>{x.name}</b></Link>{x.email ? <span>{x.email}</span> : <span className="no-email" title="No email yet: edit the instructor to add one so they can sign in"><Icon name="alert" small />No email</span>}
      {twins.get(x.id) && <span className="dup-q"><Icon name="alert" small />Same as <b>{twins.get(x.id).name}</b>?
        <button type="button" className="linkbtn" onClick={() => setMerge({ a: x, b: twins.get(x.id), keep: x.id })}>Merge</button>
        <button type="button" className="linkbtn" onClick={() => notSame(x, twins.get(x.id))}>Not the same</button></span>}</span> },
    { key: 'phone', label: 'Telephone', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (x) => (x.phone ? <a href={'tel:' + x.phone.replace(/[^\d+]/g, '')}>{x.phone}</a> : <Dash />) },
    { key: 'platforms', label: 'Platform', sortable: true, render: (x) => <span className="chips">{(x.platforms || []).map((p) => <span key={p} className="chip">{p}</span>)}</span> },
    { key: 'product', label: 'Products & can teach', sortable: true, tdStyle: { minWidth: 240 }, render: (x) => <span className="two"><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{x.product || '—'}</b><span>{x.skills}</span></span> },
    { key: 'location', label: 'Location', sortable: true },
    { key: 'vendor', label: 'Vendor', sortable: true },
    { key: 'learner', label: 'Rating', sortable: true, render: (x) => { const r = ratings.instructors[x.id]; return r ? <button type="button" className="crev-cell crev-btn" title="See who rated" onClick={() => nav(`/instructors/${x.id}?rated=1`)}><span>★</span>{r.avg.toFixed(1)} <span className="note">({r.count})</span></button> : <Dash />; } }
  ];
  // select rows to delete several at once
  const [sel, setSel] = useState(() => new Set());
  const [bulkDel, setBulkDel] = useState(false), [typed, setTyped] = useState(''), [withAccounts, setWithAccounts] = useState(true), [fromCourses, setFromCourses] = useState(false), [deleting, setDeleting] = useState(false);
  useEffect(() => { setSel((s0) => { const ids = new Set(instructors.map((x) => x.id)), n = new Set([...s0].filter((id) => ids.has(id))); return n.size === s0.size ? s0 : n; }); }, [instructors]);
  const toggle = (id) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((x) => sel.has(x.id)), someOn = rows.some((x) => sel.has(x.id));
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); rows.forEach((x) => (allOn ? n.delete(x.id) : n.add(x.id))); return n; });
  const picked = instructors.filter((x) => sel.has(x.id));
  const mustType = sel.size >= 10; // a big delete needs the word typed, a small one just a confirm
  const deleteSelected = async () => {
    setDeleting(true);
    try {
      const r = await api.post('/api/instructors/bulk-delete', { ids: [...sel], accounts: withAccounts, courses: fromCourses });
      setBulkDel(false); setTyped(''); setSel(new Set());
      await reload();
      toast(`Deleted ${r.deleted} instructor${r.deleted === 1 ? '' : 's'}${r.accounts ? ` and ${r.accounts} sign-in${r.accounts === 1 ? '' : 's'}` : ''}. A backup was saved as ${r.backup}`);
    } catch (e) { toast(e.message); } finally { setDeleting(false); }
  };
  cols.unshift({ key: 'pick', tdStyle: { width: 36 }, label: <input type="checkbox" className="pick" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={toggleAll} aria-label={allOn ? 'Unselect all listed instructors' : `Select all ${rows.length} listed instructors`} title={allOn ? 'Unselect all' : `Select all ${rows.length} listed`} />,
    render: (x) => <input type="checkbox" className="pick" checked={sel.has(x.id)} onChange={() => toggle(x.id)} aria-label={'Select ' + x.name} /> });
  // for each instructor, another one that looks like the same person (unless marked "not the same")
  const twins = useMemo(() => {
    const m = new Map();
    for (const x of instructors) {
      const y = instructors.find((o) => o.id !== x.id && !(x.notSame || []).includes(o.id) && lookAlike(x, o));
      if (y) m.set(x.id, y);
    }
    return m;
  }, [instructors]);
  const [merge, setMerge] = useState(null); // { a, b, keep }
  const coursesOf = (x) => courses.filter((c) => (c.instructors || []).some((n) => n.trim().toLowerCase() === x.name.trim().toLowerCase())).length;
  const doMerge = async () => {
    const gone = merge.keep === merge.a.id ? merge.b : merge.a, keep = merge.keep === merge.a.id ? merge.a : merge.b;
    try { await api.post(`/api/instructors/${gone.id}/merge`, { into: keep.id }); await reload(); toast(`${gone.name} merged into ${keep.name}`); setMerge(null); }
    catch (e) { toast(e.message); }
  };
  const notSame = async (x, y) => { try { await api.post(`/api/instructors/${x.id}/not-same`, { other: y.id }); await reload(); toast(`Kept ${x.name} and ${y.name} apart`); } catch (e) { toast(e.message); } };
  const toDelete = instructors.find((i) => i.id === del);
  const assigned = toDelete ? courses.filter((c) => c.instructors.includes(toDelete.name)).length : 0;
  const [signIns, setSignIns] = useState(null);
  const [assignIds, setAssignIds] = useState(null); // selected instructor ids, while choosing courses to assign them
  const makeSignIns = async () => {
    try { const r = await api.post('/api/instructors/accounts', {}); if (r.accounts.length) setSignIns(r.accounts); else toast('Every instructor with an email already has a sign-in'); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <PageHead eyebrow="Instructor repository" title="Instructors"
        summary={<><span className="pill acc">{instructors.length} certified</span><span className="pill gone">{uniq(instructors.map((i) => i.location)).length} locations</span></>}
        actions={<>
          <button className="btn" onClick={() => { downloadText(toCSV(rows, EXPORT_KEYS), `atlas-instructors-${new Date().toISOString().slice(0, 10)}.csv`); toast(`Exported ${rows.length} instructors`); }}><Icon name="download" small />Export CSV</button>
          <button className="btn" onClick={() => nav('/instructors/import')}><Icon name="upload" small />Bulk import</button>
          <button className="btn" onClick={makeSignIns} title="Create an Instructor sign-in for every instructor who doesn’t have one yet"><Icon name="people" small />Create sign-ins</button>
          <button className="btn primary" onClick={() => setForm({ record: null })}><Icon name="plus" small />New instructor</button>
        </>} />
      <section className="toolbar" aria-label="Filters">
        <label className="field grow" htmlFor="i-q"><Icon name="search" small /><span className="sr">Search</span><input id="i-q" type="search" placeholder="Search name, platform, product, or courses can teach…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} autoComplete="off" /></label>
        <select className="sel" aria-label="Platform" value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }}><option value="">All platforms</option>{uniq(instructors.flatMap((i) => i.platforms || [])).sort().map((p) => <option key={p}>{p}</option>)}</select>
        <select className="sel" aria-label="Vendor" value={vendor} onChange={(e) => { setVendor(e.target.value); setPage(1); }}><option value="">All vendors</option>{uniq(instructors.map((i) => i.vendor)).sort().map((p) => <option key={p}>{p}</option>)}</select>
        {active && <button className="btn sm" onClick={() => { setQ(''); setPlatform(''); setVendor(''); }}><Icon name="x" small />Clear filters</button>}
      </section>
      {sel.size > 0 && (
        <section className="bulkbar" aria-label="Selected instructors">
          <b><span className="num">{sel.size}</span> instructor{sel.size === 1 ? '' : 's'} selected</b>
          {!allOn && rows.length > 0 && <button className="linkbtn" onClick={toggleAll}>Select all {rows.length} listed</button>}
          <span className="grow" />
          <button className="btn sm" onClick={() => setAssignIds(picked.map((x) => x.id))}><Icon name="book" small />Assign courses</button>
          <button className="btn sm" onClick={() => downloadText(toCSV(picked, EXPORT_KEYS), `atlas-instructors-selected-${new Date().toISOString().slice(0, 10)}.csv`)}><Icon name="table" small />Export CSV</button>
          <button className="btn sm danger-o" onClick={() => { setTyped(''); setBulkDel(true); }}><Icon name="trash" small />Delete</button>
          <button className="btn sm" onClick={() => setSel(new Set())}><Icon name="x" small />Clear</button>
        </section>
      )}
      <DataTable cols={cols} rows={rows} noun="instructors" onRowClick={(x) => nav(`/instructors/${x.id}`)} sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
        actions={(x) => <>
          <button className="del" onClick={() => setDel(x.id)} aria-label={'Delete ' + x.name} title="Delete"><Icon name="trash" small /></button>
        </>}
        empty={<EmptyState title={instructors.length ? 'No instructors match these filters' : 'No instructors yet'} text={active ? 'Try a different search, or clear the filters.' : 'Add one, or import your instructor roster.'} />} />
      <InstructorForm open={!!form} record={form?.record} preset={form?.preset} onClose={() => setForm(null)} />
      <Confirm open={!!toDelete} title="Delete instructor?" message={toDelete ? `This removes ${toDelete.name} from Hazdemy.${assigned ? ` They’ll be removed from ${assigned} course${assigned > 1 ? 's' : ''}.` : ''}` : ''} confirmLabel="Delete instructor"
        onClose={() => setDel(null)} onConfirm={async () => { await api.del('/api/instructors/' + del); await reload(); toast('Deleted ' + toDelete.name); setDel(null); }} />
      <InstructorAccounts accounts={signIns} onClose={() => setSignIns(null)} />
      <BulkAssign fixed="instructors" ids={assignIds} onClose={() => setAssignIds(null)} onDone={() => setSel(new Set())} />
      <Dialog open={!!merge} onClose={() => setMerge(null)} title="Merge into one instructor?" subtitle="Choose the profile to keep. The other one’s courses, batches, sign-in, messages and reviews move to it, its details fill any gaps, and then it’s removed. A backup is saved first."
        footer={<><button className="btn" onClick={() => setMerge(null)}>Cancel</button><button className="btn primary" onClick={doMerge}><Icon name="check" small />Merge</button></>}>
        {merge && <div className="dup-pick">{[merge.a, merge.b].map((x) => (
          <label key={x.id} className={`cat-opt${merge.keep === x.id ? ' on' : ''}`}>
            <input type="radio" name="dup-keep" checked={merge.keep === x.id} onChange={() => setMerge((m) => ({ ...m, keep: x.id }))} />
            <span><b>{x.name}</b><span className="note"> · {x.email || 'no email'} · {coursesOf(x)} course{coursesOf(x) === 1 ? '' : 's'}</span></span>
            {merge.keep === x.id && <span className="pill ok">Keep this name</span>}
          </label>
        ))}</div>}
      </Dialog>
      <Dialog open={bulkDel} onClose={() => !deleting && setBulkDel(false)} title={`Delete ${sel.size} instructor${sel.size === 1 ? '' : 's'}?`}
        subtitle="They're removed from the instructor list. A backup of all data is saved in server/data first, so this can be undone."
        footer={<><button className="btn" onClick={() => setBulkDel(false)} disabled={deleting}>Cancel</button>
          <button className="btn danger" onClick={deleteSelected} disabled={deleting || (mustType && typed !== 'DELETE')}><Icon name="trash" small />{deleting ? 'Deleting…' : `Delete ${sel.size} instructor${sel.size === 1 ? '' : 's'}`}</button></>}>
        <ul className="del-list">{picked.slice(0, 6).map((x) => <li key={x.id}><b>{x.name}</b> <span className="note">{x.email}</span></li>)}{picked.length > 6 && <li className="note">…and {picked.length - 6} more</li>}</ul>
        <label className="cat-opt"><input type="checkbox" checked={fromCourses} onChange={(e) => setFromCourses(e.target.checked)} /><span>Also take them off their courses <span className="note">(otherwise courses keep these instructor names)</span></span></label>
        <label className="cat-opt"><input type="checkbox" checked={withAccounts} onChange={(e) => setWithAccounts(e.target.checked)} /><span>Also delete their sign-ins <span className="note">(they can no longer sign in as an instructor)</span></span></label>
        {mustType && <div className="fg"><label htmlFor="idel-word">Type <b>DELETE</b> to confirm</label><input id="idel-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>}
      </Dialog>
    </>
  );
}

/**
 * An instructor's own page (/instructors/:id): every detail editable in place, "Save changes" to save, the courses
 * they're assigned to alongside and their ratings below. Leaving with unsaved changes asks first.
 * The old /instructors/:id/edit address opens the same page.
 */
export function InstructorPage({ edit = false }) {
  const { id } = useParams();
  const { instructors, courses, loading, reload } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [del, setDel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const leaving = useRef(false); // set after a delete, so the page can leave without asking
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => { const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);
  const x = instructors.find((i) => i.id === id);
  useEffect(() => { if (edit) nav(`/instructors/${id}`, { replace: true }); }, [edit, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // ?rated=1 (the rating in the list): go to "Who rated"
    if (x && params.get('rated') === '1') setTimeout(() => document.getElementById('who-rated')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    else window.scrollTo({ top: 0 });
  }, [id, !!x]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!x) return loading ? <p className="note">Loading…</p>
    : <EmptyState title="Instructor not found" text="They may have been deleted or merged into another profile." action={<Link className="btn" to="/instructors">Back to Instructors</Link>} />;
  const assigned = courses.filter((c) => (c.instructors || []).includes(x.name)).length;
  return (
    <>
      <InstructorForm key={x.id} page open record={x} onClose={() => {}} onDirty={setDirty} onDelete={() => setDel(true)} />
      <Confirm open={blocker.state === 'blocked'} title="Discard unsaved changes?" message={`You have changes to ${x.name} that aren’t saved yet. Leave this page and lose them?`} confirmLabel="Discard changes"
        onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
      <Confirm open={del} title="Delete instructor?" message={`This removes ${x.name} from Hazdemy.${assigned ? ` They’ll be removed from ${assigned} course${assigned > 1 ? 's' : ''}.` : ''}`} confirmLabel="Delete instructor"
        onClose={() => setDel(false)} onConfirm={async () => {
          try { await api.del('/api/instructors/' + x.id); toast('Deleted ' + x.name); setDel(false); leaving.current = true; nav('/instructors', { replace: true }); await reload(); }
          catch (e) { toast(e.message); }
        }} />
    </>
  );
}
