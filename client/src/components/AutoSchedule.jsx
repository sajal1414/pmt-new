import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Dialog, Field } from './ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { ZONES, zoneAbbr } from '../lib/timezones.js';

const DEFAULT = ['Available', 'In-Progress'];
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toLocaleDateString('en-CA'); };
const nice = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Auto-schedule (admins): adds about one batch a month to each course with the chosen statuses, from a start date,
 * Monday to Friday, with no instructor on two batches at once. `onDone` runs after batches are added or removed.
 */
export default function AutoSchedule({ open, onClose, onDone }) {
  const { courses } = useData();
  const toast = useToast();
  const [from, setFrom] = useState(nextMonday);
  const [months, setMonths] = useState('3');
  const [zone, setZone] = useState('America/New_York'); // class times are set in this zone
  const [statuses, setStatuses] = useState(DEFAULT);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  // the statuses the courses use, with how many courses each has
  const counts = useMemo(() => { const m = new Map(); for (const c of courses) if (c.status) m.set(c.status, (m.get(c.status) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); }, [courses]);
  const picked = counts.filter(([s]) => statuses.includes(s)).reduce((a, [, n]) => a + n, 0);
  const flip = (s) => setStatuses((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  const close = () => { setResult(null); setErr({}); onClose(); };
  const run = async () => {
    setBusy('add'); setErr({});
    try { const r = await api.post('/api/schedule/auto', { from, months: +months, statuses, timeZone: zone }); setResult(r); onDone?.(); }
    catch (e) { setErr(e.fields || {}); if (!e.fields) toast(e.message); } finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('remove');
    try { const r = await api.post('/api/schedule/auto/remove', {}); toast(r.removed ? `Removed ${r.removed} auto-scheduled batch${r.removed === 1 ? '' : 'es'}` : 'There are no auto-scheduled batches to remove'); onDone?.(); }
    catch (e) { toast(e.message); } finally { setBusy(''); }
  };
  return (
    <Dialog open={open} onClose={close} title="Auto-schedule batches"
      subtitle="Adds about one batch a month to each course, Monday to Friday, with no batches over Christmas or New Year. No instructor is put on two batches on the same day, including batches already scheduled."
      footer={result
        ? <button className="btn primary" onClick={close}>Done</button>
        : <>
          <button className="btn" onClick={remove} disabled={!!busy} title="Remove the auto-scheduled batches that haven’t started and have no learners"><Icon name="trash" small />{busy === 'remove' ? 'Removing…' : 'Remove auto batches'}</button>
          <span className="grow" />
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn primary" onClick={run} disabled={!!busy || !statuses.length}><Icon name="cal" small />{busy === 'add' ? 'Scheduling…' : `Schedule ${picked} courses`}</button>
        </>}>
      {result ? (
        <div className="form" style={{ gridTemplateColumns: '1fr' }}>
          <p style={{ margin: 0 }}><b>{result.added} batches added</b> to {result.courses} courses, {nice(result.from)} – {nice(result.to)}.</p>
          {result.short.length > 0 && <p className="note" style={{ margin: 0 }}>{result.short.length} course{result.short.length === 1 ? '' : 's'} got fewer batches because {result.short.length === 1 ? 'its' : 'their'} instructors were already busy: {result.short.slice(0, 12).join(', ')}{result.short.length > 12 ? ` and ${result.short.length - 12} more` : ''}.</p>}
          <p className="note" style={{ margin: 0 }}>See them on the Schedule page. A backup was saved first as {result.backup}.</p>
        </div>
      ) : (
        <div className="form">
          <Field id="as-from" label="Start date" type="date" required value={from} onChange={setFrom} error={err.from} />
          <Field id="as-months" label="For" type="select" hideEmpty value={months} onChange={setMonths} options={[['1', '1 month'], ['2', '2 months'], ['3', '3 months'], ['4', '4 months'], ['6', '6 months']].map(([value, label]) => ({ value, label }))} />
          <Field id="as-zone" className="full" label="Time zone of the class times" type="select" hideEmpty value={zone} onChange={setZone}
            options={ZONES.map(([z, n]) => ({ value: z, label: `${n} (${zoneAbbr(z)})` }))} />
          <p className="note full" style={{ margin: '-6px 0 0' }}>Classes run 9:00 AM – 5:00 PM in this time zone (9:00 AM – 2:00 PM for half-day courses).{zone === 'Asia/Kolkata' ? ' About 1 in 4 batches is in person in Chennai; the rest are on Microsoft Teams.' : ' All batches are on Microsoft Teams.'}</p>
          <fieldset className="cat-set full"><legend>Courses with these statuses</legend>
            <div className="cat-cols two">{counts.map(([s, n]) => <label key={s} className="cat-opt"><input type="checkbox" checked={statuses.includes(s)} onChange={() => flip(s)} /><span>{s}</span><b className="num">{n}</b></label>)}</div>
            {err.statuses && <p className="bt-err" role="alert">{err.statuses}</p>}
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
