import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Dialog } from './ui.jsx';
import { api } from '../api.js';
import { useData, useToast } from '../lib/store.jsx';

const ROLES = [
  ['teaching', 'Teaching', 'book', 'Assign them as instructors of the courses.'],
  ['author', 'Course Author', 'edit', 'They own the content and can edit it.'],
  ['qualified', 'Qualified to teach', 'badge', 'They can teach it (every course they teach counts anyway).'],
  ['ipowned', 'IP Owned', 'shield', 'They developed the course and own its IP.']
];
const low = (s) => String(s || '').trim().toLowerCase();
const tokens = (s) => String(s || '').split(/[,;\n]/).map(low).filter(Boolean);

/**
 * Link many courses with many instructors at once (admins). `fixed` is what was selected on the list
 * ('courses' or 'instructors', with their `ids`); the dialog picks the other side, the link and add/remove.
 */
export default function BulkAssign({ fixed, ids, onClose, onDone }) {
  const { courses, instructors, reload } = useData();
  const toast = useToast();
  const [role, setRole] = useState('teaching');
  const [add, setAdd] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const open = !!ids?.length;
  useEffect(() => { if (open) { setPicked(new Set()); setQ(''); setRole('teaching'); setAdd(true); } }, [open]);
  const pickingInstructors = fixed === 'courses';
  const chosenCourses = pickingInstructors ? courses.filter((c) => ids?.includes(c.id)) : courses.filter((c) => picked.has(c.id));
  const chosenInsts = pickingInstructors ? instructors.filter((i) => picked.has(i.id)) : instructors.filter((i) => ids?.includes(i.id));
  const s = low(q);
  const options = useMemo(() => (pickingInstructors
    ? instructors.filter((i) => !s || low(`${i.name} ${i.email} ${i.product} ${i.skills} ${(i.platforms || []).join(' ')}`).includes(s)).sort((a, b) => a.name.localeCompare(b.name))
    : courses.filter((c) => !s || low(`${c.code} ${c.name} ${c.platform} ${c.product} ${c.customFor}`).includes(s)).sort((a, b) => String(a.code).localeCompare(String(b.code)))
  ), [pickingInstructors, instructors, courses, s]);
  // is this course–instructor pair already linked this way?
  const linked = (c, i) => {
    if (role === 'teaching') return (c.instructors || []).some((n) => low(n) === low(i.name));
    if (role === 'author') return (c.authors || []).some((n) => low(n) === low(i.name));
    if (role === 'ipowned') return (Array.isArray(i.ipOwned) ? i.ipOwned.map((e) => e?.code) : tokens(i.ipOwned)).some((t) => low(t) === low(c.code));
    return tokens(i.qualified).some((t) => t === low(c.code) || t === low(c.name));
  };
  const pairs = chosenCourses.length * chosenInsts.length;
  let willChange = 0;
  for (const c of chosenCourses) for (const i of chosenInsts) if (linked(c, i) !== add) willChange++;
  const flip = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = options.length > 0 && options.every((o) => picked.has(o.id));
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/courses/bulk-assign', { courseIds: chosenCourses.map((c) => c.id), instructorIds: chosenInsts.map((i) => i.id), role, action: add ? 'add' : 'remove' });
      await reload(['courses', 'instructors', 'activity']);
      toast(`${r.changed} link${r.changed === 1 ? '' : 's'} ${add ? 'added' : 'removed'}${r.unchanged ? ` · ${r.unchanged} already ${add ? 'there' : 'not there'}` : ''}`);
      onDone?.(); onClose();
    } catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  const roleName = ROLES.find(([k]) => k === role)[1];
  const n = ids?.length || 0;
  return (
    <Dialog open={open} onClose={onClose} wide
      title={pickingInstructors ? `Assign instructors to ${n} course${n === 1 ? '' : 's'}` : `Assign courses to ${n} instructor${n === 1 ? '' : 's'}`}
      subtitle={pickingInstructors ? chosenCourses.slice(0, 3).map((c) => c.code).join(', ') + (n > 3 ? ` and ${n - 3} more` : '') : chosenInsts.slice(0, 3).map((i) => i.name).join(', ') + (n > 3 ? ` and ${n - 3} more` : '')}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${add ? 'primary' : 'danger'}`} disabled={busy || !willChange} onClick={run}>
          <Icon name={add ? 'plus' : 'x'} small />{busy ? 'Saving…' : willChange ? `${add ? 'Add' : 'Remove'} ${willChange} link${willChange === 1 ? '' : 's'}` : 'Nothing to change'}</button></>}>
      <div className="ba">
        <div className="ba-row">
          <div className="ba-roles" role="radiogroup" aria-label="Link">
            {ROLES.map(([k, l, ic]) => (
              <button key={k} type="button" role="radio" aria-checked={role === k} className={`ba-role iv-c-${k === 'author' ? 'author' : k}${role === k ? ' on' : ''}`} onClick={() => setRole(k)}><Icon name={ic} small />{l}</button>
            ))}
          </div>
          <div className="ba-act" role="radiogroup" aria-label="Add or remove">
            <button type="button" role="radio" aria-checked={add} className={add ? 'on' : ''} onClick={() => setAdd(true)}><Icon name="plus" small />Add</button>
            <button type="button" role="radio" aria-checked={!add} className={!add ? 'on rm' : ''} onClick={() => setAdd(false)}><Icon name="x" small />Remove</button>
          </div>
        </div>
        <p className="note" style={{ margin: 0 }}>{ROLES.find(([k]) => k === role)[3]}</p>
        <label className="pick-in" htmlFor="baQ"><Icon name="search" small /><span className="sr">Search</span>
          <input id="baQ" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={pickingInstructors ? 'Search instructors by name, email, product or skill…' : 'Search courses by code, name, platform or product…'} /></label>
        <div className="ba-tools">
          <span className="note"><b>{picked.size}</b> {pickingInstructors ? 'instructor' : 'course'}{picked.size === 1 ? '' : 's'} chosen · {options.length} shown</span>
          <span className="grow" />
          {options.length > 0 && <button type="button" className="linkbtn" onClick={() => setPicked((p) => { const nx = new Set(p); options.forEach((o) => (allShown ? nx.delete(o.id) : nx.add(o.id))); return nx; })}>{allShown ? 'Unselect shown' : `Select all ${options.length} shown`}</button>}
          {picked.size > 0 && <button type="button" className="linkbtn" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
        <div className="ba-list">
          {options.length ? options.map((o) => (
            <label key={o.id} className={picked.has(o.id) ? 'on' : ''}>
              <input type="checkbox" checked={picked.has(o.id)} onChange={() => flip(o.id)} />
              {pickingInstructors
                ? <span className="ba-name"><b>{o.name}</b><span className="note">{[o.email, o.product].filter(Boolean).join(' · ')}</span></span>
                : <span className="ba-name"><b><span className="code">{o.code}</span> {o.name}</b><span className="note">{[o.platform, o.product, o.status, o.customFor && `for ${o.customFor}`].filter(Boolean).join(' · ')}</span></span>}
            </label>
          )) : <p className="note" style={{ padding: 14, margin: 0 }}>Nothing matches “{q}”.</p>}
        </div>
        {pairs > 0 && (
          <p className={`ba-sum${willChange ? '' : ' none'}`} role="status">
            <Icon name="people" small />
            {willChange
              ? <><b>{willChange}</b> {roleName} link{willChange === 1 ? '' : 's'} will be {add ? 'added' : 'removed'}{pairs - willChange ? <> · {pairs - willChange} already {add ? 'there' : 'not there'}</> : null}.</>
              : <>All {pairs} are already {add ? 'linked' : 'unlinked'} as {roleName}.</>}
          </p>
        )}
      </div>
    </Dialog>
  );
}
