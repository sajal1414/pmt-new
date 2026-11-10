import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Dialog, EmptyState, Field, PageHead } from '../components/ui.jsx';
import { BatchDialog, addWorkDays, blankBatch } from '../components/ScheduleEditor.jsx';
import { CustomVersionDialog } from '../components/CustomVersion.jsx';
import InstructorAccounts from '../components/InstructorAccounts.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { ago } from '../lib/constants.js';
import { zoneAbbr, zoneName } from '../lib/timezones.js';
const validZone = (tz) => { try { return !!tz && !!new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return false; } };

const TABS = [['New', 'New'], ['Approved', 'Approved'], ['Declined', 'Declined'], ['all', 'All']];
const TONE = { New: 'warn', Approved: 'ok', Declined: 'gone' };
// the three kinds, each with its own section
const KINDS = [['details', 'Price & details'], ['batch', 'New batch'], ['change', 'Batch change'], ['custom', 'Custom version']];
const KIND_TONE = { details: 'ok', batch: 'acc', change: 'warn', custom: 'cv-pill' };
const nice = (s) => (s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const weekend = (s) => [0, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay());
const nextWeekday = (s) => { let d = s; while (weekend(d)) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); d = t.toISOString().slice(0, 10); } return d; };

/** Learners asking for a batch of a course, or a custom version for their company: create it, or decline with a note. */
export default function Requests() {
  const { courses, reload: reloadAll } = useData();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('New');
  const [kind, setKind] = useState('');
  const [batchFor, setBatchFor] = useState(null); // { r, course, b }
  const [customFor, setCustomFor] = useState(null); // { r, course }
  const [decline, setDecline] = useState(null); // { r, reply }
  const [replyTo, setReplyTo] = useState(null); // { r, reply } while answering a price question
  const [accounts, setAccounts] = useState(null);
  const [moveFor, setMoveFor] = useState(null); // { r, course, batchId }
  const load = () => api.get('/api/requests').then(setList, (e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const all = list || [];
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, all.filter((r) => k === 'all' || r.status === k).length])), [list]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = all.filter((r) => (tab === 'all' || r.status === tab) && (!kind || r.kind === kind));
  const answer = async (r, status, extra = {}) => {
    await api.put('/api/requests/' + r.id, { status, ...extra });
    await load(); window.dispatchEvent(new Event('atlas:requests'));
  };
  // a batch from the request: its date (a weekday), zone and delivery, with the learner already on it
  const startBatch = (r) => {
    const course = courses.find((c) => c.id === r.courseId);
    if (!course) { toast('That course has been deleted.'); return; }
    const b = blankBatch(course, course.schedules || []), start = r.preferredStart ? nextWeekday(r.preferredStart) : '';
    const days = Math.max(1, Math.ceil(+course.duration || 1));
    setBatchFor({ r, course, b: { ...b, startDate: start, endDate: start ? addWorkDays(start, days - 1) : '', timeZone: validZone(r.timeZone) ? r.timeZone : b.timeZone, mode: r.mode || b.mode, learners: [r.email] } });
  };
  const saveBatch = async (b) => {
    const { r, course } = batchFor, { isNew, ...clean } = b;
    try {
      const saved = await api.put('/api/courses/' + course.id, { schedules: [...(course.schedules || []), clean] });
      const made = (saved.schedules || []).find((x) => x.startDate === clean.startDate && (x.learners || []).includes(r.email));
      if (r.kind === 'change' && made) { await move(r, made.id); setBatchFor(null); return; }
      await answer(r, 'Approved', { resultId: made?.id || '', reply: `Batch added: ${nice(clean.startDate)}${clean.endDate !== clean.startDate ? ` – ${nice(clean.endDate)}` : ''}. You’re enrolled.` });
      await reloadAll(['courses', 'activity']);
      toast(`Batch added to ${course.code}, and ${r.name} is enrolled`); setBatchFor(null);
      if (saved.accounts?.length) setAccounts(saved.accounts);
    } catch (e) { toast(e.fields?.schedules || e.message); }
  };
  const startCustom = (r) => {
    const course = courses.find((c) => c.id === r.courseId);
    if (!course) { toast('That course has been deleted.'); return; }
    setCustomFor({ r, course });
  };
  // batch change: move the learner to another of the course's batches, or to a new one made for them
  const startMove = (r) => {
    const course = courses.find((c) => c.id === r.courseId);
    if (!course) { toast('That course has been deleted.'); return; }
    setMoveFor({ r, course, batchId: '' });
  };
  const move = async (r, batchId) => {
    try { await api.post(`/api/requests/${r.id}/move`, { batchId }); await load(); await reloadAll(['courses', 'activity']); window.dispatchEvent(new Event('atlas:requests')); toast(`${r.name} moved to the new batch`); setMoveFor(null); }
    catch (e) { toast(e.message); }
  };
  const sendDecline = async () => {
    try { await answer(decline.r, 'Declined', { reply: decline.reply }); toast('Request declined'); setDecline(null); } catch (e) { toast(e.message); }
  };

  return (
    <>
      <PageHead eyebrow="From learners" title="Requests" summary={<span className="pill acc">{counts.New || 0} new</span>} />
      {error && <div className="card" role="alert"><b style={{ color: 'var(--red-ink)' }}>{error}</b></div>}
      <section className="card sc-card">
        <div className="sc-bar">
          <div className="t-tabs" role="tablist" aria-label="Status">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span>({counts[k] || 0})</span></button>)}
          </div>
          <span className="grow" />
          <div className="sc-view" role="group" aria-label="Kind">{[['', 'All'], ...KINDS].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l} <span>({all.filter((r) => (tab === 'all' || r.status === tab) && (!k || r.kind === k)).length})</span></button>
          ))}</div>
        </div>
        {!list ? !error && <p className="note" role="status">Loading…</p>
          : !rows.length ? <EmptyState title={all.length ? 'Nothing here' : 'No requests yet'} text="Learners can ask for a batch, or a custom version for their company, from any course page." />
          : KINDS.filter(([k]) => rows.some((r) => r.kind === k)).map(([k, l]) => (
            <div key={k} className="rq-sec"><h2>{l} <span className="note">· {rows.filter((r) => r.kind === k).length}</span></h2>
            <ul className="rq-list">{rows.filter((r) => r.kind === k).map((r) => (
            <li key={r.id} className="rq">
              <div className="rq-head">
                <span className={`pill ${KIND_TONE[r.kind]}`}>{KINDS.find(([k]) => k === r.kind)?.[1]}</span>
                <span className={`pill ${TONE[r.status]}`}>{r.status}</span>
                <span className="note">{ago(new Date(r.at).getTime())}</span>
              </div>
              <div className="rq-body">
                <div>
                  <Link to={'/courses/' + r.courseId}><span className="code">{r.courseCode}</span> <b>{r.courseName || r.course}</b></Link>
                  <p className="rq-who"><Icon name="user" small /><b>{r.name}</b> <a href={'mailto:' + r.email}>{r.email}</a>{r.company && <> · <Icon name="people" small />{r.company}</>}</p>
                </div>
                <dl className="rq-facts">
                  {r.fromBatch && <><dt>Now on</dt><dd>{nice(r.fromBatch.startDate)}{r.fromBatch.endDate !== r.fromBatch.startDate ? ` – ${nice(r.fromBatch.endDate)}` : ''}</dd></>}
                  {r.preferredStart && <><dt>{r.kind === 'change' ? 'Wants' : 'Start'}</dt><dd>{nice(r.preferredStart)}{r.timeOfDay && r.timeOfDay !== 'Any time' ? ` · ${r.timeOfDay}` : ''}</dd></>}
                  {r.kind !== 'change' && <><dt>People</dt><dd>{r.people}</dd></>}
                  <dt>Delivery</dt><dd>{r.mode}</dd>
                  {r.timeZone && <><dt>Time zone</dt><dd>{zoneName(r.timeZone)} ({zoneAbbr(r.timeZone)})</dd></>}
                </dl>
              </div>
              {r.message && <p className="rq-msg">“{r.message}”</p>}
              {r.status !== 'New' && <p className="note" style={{ margin: 0 }}>{r.status} by {r.handledBy} {ago(new Date(r.handledAt).getTime())}{r.reply ? `: ${r.reply}` : ''}</p>}
              <div className="rq-act">
                {r.status === 'New' ? <>
                  {r.kind === 'details' && <button className="btn sm primary" onClick={() => setReplyTo({ r, reply: '' })}><Icon name="send" small />Reply with price</button>}
                  {r.kind === 'change' && <button className="btn sm primary" onClick={() => startMove(r)}><Icon name="clock" small />Move to another batch</button>}
                  {r.kind === 'custom' || r.kind === 'details'
                    ? null
                    : <button className={`btn sm${r.kind === 'batch' ? ' primary' : ''}`} onClick={() => startBatch(r)}><Icon name="cal" small />{r.kind === 'change' ? 'Create a batch for them' : 'Create batch'}</button>}
                  {r.kind === 'batch'
                    ? null
                    : r.kind === 'custom' && <button className="btn sm primary" onClick={() => startCustom(r)}><Icon name="copy" small />Create custom version</button>}
                  <button className="btn sm" onClick={() => setDecline({ r, reply: '' })}><Icon name="x" small />Decline</button>
                </> : <button className="btn sm" onClick={() => answer(r, 'New', { reply: '' }).then(() => toast('Moved back to New'))}><Icon name="reset" small />Reopen</button>}
              </div>
            </li>
          ))}</ul></div>
          ))}
      </section>
      <BatchDialog key={batchFor?.r.id || 'none'} open={!!batchFor} initial={batchFor?.b} course={batchFor?.course || {}} onClose={() => setBatchFor(null)} onSave={saveBatch} />
      {customFor && <CustomVersionDialog open course={customFor.course} client={customFor.r.company} onClose={() => setCustomFor(null)}
        onCreated={(c) => answer(customFor.r, 'Approved', { resultId: c.id, reply: `Custom version created: ${c.code} ${c.name}.` })} />}
      <Dialog open={!!moveFor} onClose={() => setMoveFor(null)} title="Move to another batch" subtitle={moveFor ? `${moveFor.r.name} · ${moveFor.r.course}` : ''}
        footer={<><button className="btn" onClick={() => setMoveFor(null)}>Cancel</button><button className="btn primary" disabled={!moveFor?.batchId} onClick={() => move(moveFor.r, moveFor.batchId)}><Icon name="check" small />Move</button></>}>
        {moveFor && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const options = (moveFor.course.schedules || []).filter((b) => b.endDate >= today && b.status !== 'Cancelled' && b.id !== moveFor.r.fromBatch?.id);
          return options.length ? <>
            <p className="note" style={{ margin: 0 }}>They asked for {nice(moveFor.r.preferredStart)}{moveFor.r.timeOfDay && moveFor.r.timeOfDay !== 'Any time' ? `, ${moveFor.r.timeOfDay.toLowerCase()}` : ''}. They’re taken off their current batch and put on the one you choose.</p>
            <Field id="mv-b" label="Batch" type="select" required hideEmpty value={moveFor.batchId} onChange={(v) => setMoveFor((m) => ({ ...m, batchId: v }))}
              options={[{ value: '', label: 'Select a batch…' }, ...options.map((b) => { const left = b.seats !== '' && b.seats != null ? b.seats - (b.learners || []).length : null;
                return { value: b.id, label: `${nice(b.startDate)}${b.endDate !== b.startDate ? ` – ${nice(b.endDate)}` : ''} · ${b.startTime}–${b.endTime} ${zoneAbbr(b.timeZone)} · ${b.mode}${left != null ? ` · ${Math.max(0, left)} seats left` : ''}` }; })]} />
          </> : <p className="note" style={{ margin: 0 }}>This course has no other upcoming batch. Use <b>Create a batch for them</b> instead.</p>;
        })()}
      </Dialog>
      <Dialog open={!!decline} onClose={() => setDecline(null)} title="Decline this request?" subtitle={decline ? `${decline.r.name} · ${decline.r.course}` : ''}
        footer={<><button className="btn" onClick={() => setDecline(null)}>Cancel</button><button className="btn danger" onClick={sendDecline}><Icon name="x" small />Decline</button></>}>
        {decline && <Field id="rq-reply" label="Note for the learner (optional)" type="textarea" value={decline.reply} onChange={(v) => setDecline((d) => ({ ...d, reply: v }))} placeholder="e.g. The next batch is on 14 Dec; please join that one." />}
        <p className="note" style={{ margin: 0 }}>The learner sees this on the course page.</p>
      </Dialog>
      <Dialog open={!!replyTo} onClose={() => setReplyTo(null)} title="Reply with price and details" subtitle={replyTo ? `${replyTo.r.name} · ${replyTo.r.course}` : ''}
        footer={<><button className="btn" onClick={() => setReplyTo(null)}>Cancel</button><button className="btn primary" disabled={!replyTo?.reply.trim()}
          onClick={async () => { try { await answer(replyTo.r, 'Approved', { reply: replyTo.reply }); setReplyTo(null); toast('Reply sent'); } catch (x) { toast(x.message); } }}><Icon name="send" small />Send reply</button></>}>
        {replyTo && <Field id="rq-answer" label="Your reply" required type="textarea" value={replyTo.reply} onChange={(v) => setReplyTo((d) => ({ ...d, reply: v }))} placeholder="e.g. The price is $499 per person, with 10% off for 5 or more. Reply to this email to book." />}
        <p className="note" style={{ margin: 0 }}>The learner sees this on the course page{replyTo ? ` and gets it by email at ${replyTo.r.email} when email is on` : ''}. To let them buy online, add a price to the course.</p>
      </Dialog>
      <InstructorAccounts who="learner" accounts={accounts} onClose={() => setAccounts(null)} />
    </>
  );
}
