import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Confirm, Dialog, Field } from './ui.jsx';
import { useToast } from '../lib/store.jsx';
import { useSite } from '../lib/site.js';
import { api } from '../api.js';
import BatchList from './BatchList.jsx';
import { ZONES, localZone, zoneName, zoneAbbr, timesIn, zonedToUtc, shiftLabel } from '../lib/timezones.js';

const STATUSES = ['Open', 'Few seats left', 'Full', 'Cancelled'];
const MODES = ['Virtual', 'In person', 'Hybrid'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// batches run Monday to Friday, unless the class days say it's a weekend batch ("Sat & Sun")
const weekendOf = (s) => [0, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay());
export const weekendBatch = (b) => /sat|sun|weekend/i.test(b.days || '');
/** The day `n` class days after `s`, skipping Saturdays and Sundays. */
/** Up to 5 weekdays with a Saturday or Sunday in between: the batch should fit in one week. */
const overWeekend = (start, end) => {
  let weekdays = 0, weekend = false;
  for (let x = start; x <= end && weekdays <= 5; x = addDays(x, 1)) { if (weekendOf(x)) weekend = true; else weekdays++; }
  return weekend && weekdays <= 5;
};
export const addWorkDays = (s, n) => { let d = s; while (n > 0) { d = addDays(d, 1); if (!weekendOf(d)) n--; } return d; };
const today = () => new Date().toISOString().slice(0, 10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// learners' emails typed or pasted: split on commas, spaces or new lines, without repeats
const emailsOf = (t) => [...new Set(String(t || '').split(/[\s,;]+/).map((x) => x.trim().replace(/^mailto:/i, '').toLowerCase()).filter(Boolean))];

/** Checks one batch the same way the server does; returns { field: message }. */
function problems(b) {
  const e = {};
  if (!DATE.test(b.startDate)) e.startDate = 'Choose a start date.';
  else if (!weekendBatch(b) && weekendOf(b.startDate)) e.startDate = 'That’s a Saturday or Sunday: choose a weekday.';
  if (b.endDate && DATE.test(b.endDate) && !weekendBatch(b) && weekendOf(b.endDate)) e.endDate = 'That’s a Saturday or Sunday: choose a weekday.';
  else if (!e.startDate && b.endDate && DATE.test(b.endDate) && !weekendBatch(b) && overWeekend(b.startDate, b.endDate)) e.startDate = 'This batch runs over the weekend. Start it earlier in the week so it ends by Friday.';
  if (b.endDate && DATE.test(b.startDate) && b.endDate < b.startDate) e.endDate = 'Must be on or after the start date.';
  if (!b.startTime) e.startTime = 'Enter a start time.';
  if (!b.endTime) e.endTime = 'Enter an end time.';
  else if (b.endTime === b.startTime) e.endTime = 'Must differ from the start time.';
  if (!b.timeZone) e.timeZone = 'Choose a time zone.';
  if (b.seats !== '' && (+b.seats < 0 || !Number.isFinite(+b.seats))) e.seats = 'Enter a number of seats.';
  const mails = emailsOf(b.learnersText), bad = mails.filter((x) => !EMAIL.test(x));
  if (bad.length) e.learnersText = `Not an email address: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''}.`;
  else if (b.seats !== '' && +b.seats > 0 && mails.length > +b.seats) e.learnersText = `${mails.length} learners, but the batch has ${b.seats} seats. Raise the seats or remove some emails.`;
  return e;
}

/** A new batch for `course`, starting from the times and settings of its last one. */
export function blankBatch(course, list = []) {
  const last = list[list.length - 1];
  return { id: 'new-' + Date.now(), isNew: true, startDate: '', endDate: '', startTime: last?.startTime || '09:00', endTime: last?.endTime || '17:00', timeZone: last?.timeZone || 'Asia/Kolkata',
    days: last?.days || 'Mon–Fri', mode: last?.mode || 'Virtual', location: '', instructor: (course.instructors || [])[0] || '', seats: course.maxStudents || '', status: 'Open', notes: '', learners: [] };
}

export function BatchDialog({ open, initial, course, onClose, onSave }) {
  const [b, setB] = useState(() => initial && { ...initial, learnersText: (initial.learners || []).join('\n') });
  const [err, setErr] = useState({});
  const [touchedEnd, setTouchedEnd] = useState(!!initial?.endDate);
  const here = localZone();
  const zoneOptions = useMemo(() => {
    const list = ZONES.map(([z, n]) => ({ value: z, label: `${n} (${zoneAbbr(z)})` }));
    return ZONES.some(([z]) => z === here) ? list : [{ value: here, label: `${zoneName(here)} (${zoneAbbr(here)}) — your time` }, ...list];
  }, [here]);
  if (!open || !b) return null;
  const days = Math.max(1, Math.ceil(+course.duration || 1));
  const set = (k) => (v) => setB((s) => {
    const n = { ...s, [k]: v };
    // a new start date moves the end date along with it, using the course length, until the end is set by hand
    if (k === 'startDate' && DATE.test(v) && !touchedEnd) n.endDate = weekendBatch(n) ? addDays(v, days - 1) : addWorkDays(v, days - 1);
    return n;
  });
  const ready = DATE.test(b.startDate) && b.startTime && b.endTime && b.startTime !== b.endTime && b.timeZone;
  const preview = ready ? [here, ...ZONES.map(([z]) => z)].filter((z, i, a) => z !== b.timeZone && a.indexOf(z) === i).slice(0, 8) : [];
  const save = () => {
    const e = problems(b);
    setErr(e);
    if (Object.keys(e).length) return;
    const { learnersText, ...rest } = b;
    onSave({ ...rest, learners: emailsOf(learnersText), endDate: b.endDate || b.startDate, seats: b.seats === '' ? '' : Math.round(+b.seats) });
  };
  return (
    <Dialog open wide title={initial.isNew ? 'Add a batch' : 'Edit batch'} subtitle="Set the dates and class times in the time zone the batch is taught in. Everyone else sees them converted to their own time." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}><Icon name="check" small />{initial.isNew ? 'Add batch' : 'Done'}</button></>}>
      <div className="form bt-form">
        <Field id="b-sd" label="Start date" type="date" required value={b.startDate} onChange={set('startDate')} error={err.startDate} />
        <Field id="b-ed" label="End date" type="date" value={b.endDate} onChange={(v) => { setTouchedEnd(true); set('endDate')(v); }} error={err.endDate} />
        <Field id="b-st" label="Class starts" type="time" required value={b.startTime} onChange={set('startTime')} error={err.startTime} />
        <Field id="b-et" label="Class ends" type="time" required value={b.endTime} onChange={set('endTime')} error={err.endTime} />
        <Field id="b-tz" className="full" label="Time zone of these times" type="select" required hideEmpty options={zoneOptions} value={b.timeZone} onChange={set('timeZone')} error={err.timeZone} />
        <Field id="b-days" label="Class days (optional)" value={b.days} onChange={set('days')} placeholder="e.g. Mon–Fri, or Sat & Sun" />
        <p className="note full" style={{ margin: '-6px 0 0' }}>Batches run Monday to Friday and don’t run over a weekend: a 3-day course starts Monday to Wednesday. For a weekend batch, put Sat or Sun in Class days.</p>
        <Field id="b-mode" label="Delivery" type="select" required hideEmpty options={MODES} value={b.mode} onChange={set('mode')} />
        <Field id="b-loc" className="full" label={b.mode === 'Virtual' ? 'Platform (optional)' : 'Location (optional)'} value={b.location} onChange={set('location')} placeholder={b.mode === 'Virtual' ? 'e.g. Zoom, Microsoft Teams' : 'e.g. Hazdemy Bengaluru, 4th floor'} />
        <Field id="b-inst" label="Instructor" type="select" options={course.instructors || []} value={b.instructor} onChange={set('instructor')} />
        <Field id="b-seats" label="Seats (optional)" type="number" step="1" value={b.seats} onChange={set('seats')} error={err.seats} />
        <Field id="b-status" label="Status" type="select" required hideEmpty options={STATUSES} value={b.status} onChange={set('status')} />
        <Field id="b-learners" className="full" label={`Learner emails (optional)${emailsOf(b.learnersText).length ? ` · ${emailsOf(b.learnersText).length}` : ''}`} type="textarea" value={b.learnersText} onChange={set('learnersText')} error={err.learnersText}
          placeholder={'One per line, or separated by commas. Paste a column from Excel.\nname@company.com'} />
        <Field id="b-notes" className="full" label="Internal notes (not shown to learners or websites)" type="textarea" value={b.notes} onChange={set('notes')} placeholder="Meeting links, lab setup, contacts…" />
      </div>
      {ready && (
        <div className="bt-preview" aria-live="polite">
          <b>{(() => { const t = timesIn(b, b.timeZone); return `${t.times} ${t.abbr}`; })()}</b> on {new Date(zonedToUtc(b.startDate, b.startTime, b.timeZone)).toLocaleDateString('en-US', { timeZone: b.timeZone, weekday: 'short', month: 'short', day: 'numeric' })} is:
          <ul>{preview.map((z) => { const t = timesIn(b, z); return <li key={z}><span>{z === here ? 'Your time' : zoneName(z)}</span><b>{t.times} {t.abbr}</b>{t.shift !== 0 && <em>{shiftLabel(t.shift)}</em>}</li>; })}</ul>
        </div>
      )}
    </Dialog>
  );
}

const longDay = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** The message for a batch's learners: what, when (in the batch's own time zone), how and who. */
function batchMessage(course, b) {
  const t = timesIn(b, b.timeZone);
  const when = b.endDate && b.endDate !== b.startDate ? `${longDay(b.startDate)} – ${longDay(b.endDate)}` : longDay(b.startDate);
  return {
    subject: `${course.name}${course.code ? ` (${course.code})` : ''}: ${when}`,
    body: [
      'Hello,', '',
      `You're booked on ${course.name}${course.code ? ` (${course.code})` : ''}.`, '',
      `Dates: ${when}`,
      `Time: ${t.times} ${t.abbr} (${zoneName(b.timeZone)})${b.days ? `, ${b.days}` : ''}`,
      `Delivery: ${b.mode}${b.location ? ` · ${b.location}` : ''}`,
      b.instructor && `Instructor: ${b.instructor}`, '',
      'Regards,', 'Hazdemy Learning Services'
    ].filter((x) => x !== false && x != null).join('\n')
  };
}

/** Email a batch's learners from your own mail app: the emails go in Bcc, with the batch details as the message. */
export function EmailDialog({ course, batch, onClose }) {
  const toast = useToast();
  const [m, setM] = useState(() => (batch ? batchMessage(course, batch) : null));
  const site = useSite();
  const [sending, setSending] = useState(false);
  if (!batch || !m) return null;
  const saved = !String(batch.id).startsWith('new-');
  const send = async () => {
    setSending(true);
    try { const r = await api.post('/api/schedule/email', { courseId: course.id, batchId: batch.id, subject: m.subject, body: m.body }); toast(`Emailed ${r.sent} learner${r.sent === 1 ? '' : 's'}`); onClose(); }
    catch (e) { toast(e.message); } finally { setSending(false); }
  };
  const to = batch.learners || [];
  // a mail link has a length limit in some apps: past it, copy the emails and the message instead
  const href = `mailto:?bcc=${to.map(encodeURIComponent).join(',')}&subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  const tooLong = href.length > 1900;
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Copy didn’t work: select the text and copy it'); } };
  return (
    <Dialog open wide title={`Email ${to.length} learner${to.length === 1 ? '' : 's'}`} subtitle="Opens a new message in your mail app (Outlook, Gmail…), with the learners in Bcc so they don’t see each other’s emails. Change the message as you like first." onClose={onClose}
      footer={<>
        <button className="btn" onClick={() => copy(to.join('; '), 'Emails')}><Icon name="copy" small />Copy emails</button>
        <button className="btn" onClick={() => copy(`${m.subject}\n\n${m.body}`, 'Message')}><Icon name="copy" small />Copy message</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Close</button>
        {site.mail && <button className="btn primary" onClick={send} disabled={sending || !saved} title={saved ? 'Send it now from Hazdemy' : 'Save the course first'}><Icon name="send" small />{sending ? 'Sending…' : 'Send now'}</button>}
        {tooLong ? <button className="btn primary" disabled title="Too many emails for a mail link: use Copy emails and Copy message"><Icon name="send" small />Open in mail app</button>
          : <a className="btn primary" href={href} onClick={() => setTimeout(onClose, 300)}><Icon name="send" small />Open in mail app</a>}
      </>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <p className="note" style={{ margin: 0 }}><b>Bcc:</b> {to.join(', ')}</p>
        <Field id="em-subject" label="Subject" value={m.subject} onChange={(v) => setM((s) => ({ ...s, subject: v }))} />
        <Field id="em-body" label="Message" type="textarea" value={m.body} onChange={(v) => setM((s) => ({ ...s, body: v }))} />
        {tooLong && <p className="note" style={{ margin: 0 }}>There are too many emails to open as one mail link. Use <b>Copy emails</b>, paste them into Bcc in a new message, then <b>Copy message</b>.</p>}
      </div>
    </Dialog>
  );
}

/** "Schedule & Time Zones" tab: the course's batches. Changes go into the course draft and are saved with it. */
export default function ScheduleEditor({ course, onChange, error }) {
  const list = course.schedules || [];
  const [edit, setEdit] = useState(null); // { i, b }
  const [del, setDel] = useState(null);
  const [showPast, setShowPast] = useState(false);
  const [mail, setMail] = useState(null); // the batch whose learners are being emailed
  const now = today();
  const shown = list.map((b, i) => ({ b, i })).filter(({ b }) => showPast || b.endDate >= now);
  const past = list.length - list.filter((b) => b.endDate >= now).length;
  const blank = () => blankBatch(course, list);
  const sorted = (l) => [...l].sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
  const put = (b) => {
    const { isNew, ...clean } = b;
    onChange(sorted(edit.i == null ? [...list, clean] : list.map((x, j) => (j === edit.i ? clean : x))));
    setEdit(null);
  };
  return (
    <section className="card bt-card">
      <div className="bt-head">
        <div><h2><Icon name="clock" small /> Schedule &amp; time zones</h2>
          <p className="note" style={{ margin: 0 }}>Add each batch with its dates and class times in the time zone it’s taught in. Learners and the websites see the times in their own zone too. Save the course to keep changes.</p></div>
        <button className="btn primary" onClick={() => setEdit({ i: null, b: blank() })}><Icon name="plus" small />Add batch</button>
      </div>
      {error && <p className="bt-err" role="alert">{error}</p>}
      <BatchList batches={shown.map(({ b }) => b)} showNotes
        empty={<div className="empty"><Icon name="cal" /><b>No batches scheduled</b><span>Add the next batch, for example 3 Nov, 9:00 AM – 5:00 PM IST.</span></div>}
        actions={(b, k) => { const i = shown[k].i; return <>
          <button className="btn sm" onClick={() => setEdit({ i, b: { ...b } })}><Icon name="edit" small />Edit</button>
          {b.learners?.length > 0 && <button className="btn sm" onClick={() => setMail(b)} title="Email this batch’s learners from your mail app"><Icon name="send" small />Email learners</button>}
          <button className="btn sm" onClick={() => setEdit({ i: null, b: { ...b, id: 'new-' + Date.now(), isNew: true, startDate: '', endDate: '', status: 'Open' } })}><Icon name="copy" small />Duplicate</button>
          <button className="btn sm ad-no" onClick={() => setDel(i)}><Icon name="trash" small />Delete</button>
        </>; }} />
      {past > 0 && <button className="linkbtn" onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide' : 'Show'} {past} finished batch{past > 1 ? 'es' : ''}</button>}
      <EmailDialog key={mail?.id || 'none-mail'} course={course} batch={mail} onClose={() => setMail(null)} />
      <BatchDialog key={edit?.b.id || 'none'} open={!!edit} initial={edit?.b} course={course} onClose={() => setEdit(null)} onSave={put} />
      <Confirm open={del != null} title="Delete this batch?" message={del != null && list[del] ? `The batch starting ${list[del].startDate || '(no date)'} is removed when you save the course.` : ''} confirmLabel="Delete batch"
        onClose={() => setDel(null)} onConfirm={() => { onChange(list.filter((_, j) => j !== del)); setDel(null); }} />
    </section>
  );
}
