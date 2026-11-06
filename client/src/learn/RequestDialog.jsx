import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Dialog, Field } from '../components/ui.jsx';
import { api } from '../api.js';
import { useToast } from '../lib/store.jsx';
import { ZONES, localZone, zoneAbbr, zoneName } from '../lib/timezones.js';
import { useLearn } from './lib.jsx';

const MODES = ['Virtual', 'In person', 'Hybrid'], TIMES = ['Any time', 'Morning', 'Afternoon', 'Evening'];
const TITLE = { batch: 'Request a new batch', change: 'Request a batch change', custom: 'Request a custom version' };
export const KIND_LABEL = { batch: 'New batch', change: 'Batch change', custom: 'Custom version' };
const TONE = { New: 'warn', Approved: 'ok', Declined: 'gone' };
const nice = (s) => (s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * Ask about `course`: a new batch (`kind` "batch"), a different date or time than my batch ("change"; `current` is that batch)
 * or a custom version for a company ("custom").
 */
export function RequestDialog({ kind, course, current, onClose, onDone }) {
  const { q } = useLearn();
  const toast = useToast();
  const here = localZone();
  const [f, setF] = useState({});
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (kind) { setF({ preferredStart: '', timeZone: here, mode: current?.mode || 'Virtual', people: '1', company: '', message: '', timeOfDay: 'Any time' }); setErr({}); } }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kind || !course) return null;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const zones = ZONES.some(([z]) => z === here) ? ZONES : [[here, zoneName(here)], ...ZONES];
  const send = async () => {
    setBusy(true); setErr({});
    try {
      await api.post(q('/api/learn/requests'), { ...f, kind, courseId: course.id });
      toast(kind === 'custom' ? 'Custom version request sent. We’ll get in touch.' : 'Request sent. We’ll let you know here and in your notifications.');
      onDone?.(); onClose();
    } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  const batch = kind !== 'custom', change = kind === 'change';
  return (
    <Dialog open onClose={onClose} title={TITLE[kind]} subtitle={course.name}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={send} disabled={busy}><Icon name="send" small />{busy ? 'Sending…' : 'Send request'}</button></>}>
      <p className="note" style={{ margin: 0 }}>{change
        ? <>You’re on the batch of <b>{nice(current?.startDate)}{current?.endDate && current.endDate !== current.startDate ? ` – ${nice(current.endDate)}` : ''}</b>. Tell us the date and time that would suit you better and we’ll move you to another batch.</>
        : batch ? 'Can’t find a date that suits you? Tell us when you’d like to start and we’ll try to schedule a batch.'
        : 'A version of this course for your company or team: tell us what you’d like changed, such as topics, length or examples from your own systems.'}</p>
      <div className="form">
        {!batch && <Field id="rq-co" className="full" label="Company or team" required value={f.company} onChange={set('company')} error={err.company} placeholder="e.g. Acme Bank, Data team" />}
        <Field id="rq-start" label={batch ? 'Preferred start date' : 'Preferred start (optional)'} type="date" required={batch} value={f.preferredStart} onChange={set('preferredStart')} error={err.preferredStart} />
        {change ? <Field id="rq-tod" label="Preferred time of day" type="select" hideEmpty value={f.timeOfDay} onChange={set('timeOfDay')} options={TIMES} />
          : <Field id="rq-people" label="Number of people" type="number" step="1" value={f.people} onChange={set('people')} />}
        <Field id="rq-zone" label="Your time zone" type="select" hideEmpty value={f.timeZone} onChange={set('timeZone')} options={zones.map(([z, n]) => ({ value: z, label: `${n} (${zoneAbbr(z)})` }))} />
        <Field id="rq-mode" label="Delivery" type="select" hideEmpty value={f.mode} onChange={set('mode')} options={MODES} />
        <Field id="rq-msg" className="full" label={batch ? 'Anything else (optional)' : 'What should be different?'} type="textarea" value={f.message} onChange={set('message')}
          placeholder={change ? 'e.g. I’m travelling that week; any batch in December works' : batch ? 'e.g. mornings only, or a week in January' : 'e.g. focus on DataStage on Cloud Pak, 2 days instead of 3'} />
      </div>
    </Dialog>
  );
}

/** The learner's own requests for this course, with what came of them. */
export function MyRequests({ list }) {
  if (!list?.length) return null;
  return (
    <section className="card l-reqs">
      <h2 style={{ margin: 0 }}>Your requests</h2>
      <ul>{list.map((r) => (
        <li key={r.id}>
          <span className={`pill ${TONE[r.status] || 'gone'}`}>{r.status === 'New' ? 'Sent' : r.status}</span>
          <span><b>{r.kind === 'custom' ? `Custom version for ${r.company}` : KIND_LABEL[r.kind]}</b>{r.preferredStart && ` · from ${nice(r.preferredStart)}`}{r.kind === 'change' ? ` · ${r.timeOfDay}` : ` · ${r.people} ${r.people === 1 ? 'person' : 'people'}`} · {r.mode}
            {r.reply && <span className="note"> — “{r.reply}”</span>}</span>
        </li>
      ))}</ul>
    </section>
  );
}
