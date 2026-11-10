import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Dialog, Field, PageHead } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useData, useToast } from '../../lib/store.jsx';
import { useAdminData, Loading, ErrorNote, num } from '../lib.jsx';
import { ago } from '../../lib/constants.js';

function Toggle({ id, label, hint, checked, onChange }) {
  return (
    <label className="am-toggle" htmlFor={id}>
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i aria-hidden="true" />
    </label>
  );
}

/** Security: health checks, session and lockout settings, locked accounts and the security log. */
function SecurityCard({ f, set, err }) {
  const toast = useToast();
  const { data, reload } = useAdminData('/api/admin/security');
  const [confirm, setConfirm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const unlock = async (email) => { try { await api.post('/api/admin/security/unlock', { email }); toast(`${email} unlocked`); reload(); } catch (x) { toast(x.message); } };
  const signOutAll = async () => { try { await api.post('/api/admin/security/signout-all'); toast('Everyone else has been signed out'); setConfirm(false); reload(); } catch (x) { toast(x.message); } };
  const log = data?.log || [];
  return (
    <section className="card sec-card">
      <h2><Icon name="shield" small />Security</h2>
      {data && <ul className="sec-checks">{data.checks.map((c) => (
        <li key={c.title} className={c.ok ? 'ok' : 'warn'}><Icon name={c.ok ? 'check' : 'alert'} small /><div><b>{c.title}</b><span>{c.text}</span></div></li>
      ))}</ul>}
      <div className="form">
        <Field id="st-sess" label="Sign-in lasts (hours)" type="number" value={f.sessionHours} onChange={(v) => set('sessionHours')(v)} error={err.sessionHours} />
        <Field id="st-lock" label="Lock an account after (wrong passwords)" type="number" value={f.lockAfter} onChange={(v) => set('lockAfter')(v)} error={err.lockAfter} />
        <Field id="st-lockm" label="Lock for (minutes)" type="number" value={f.lockMinutes} onChange={(v) => set('lockMinutes')(v)} error={err.lockMinutes} />
      </div>
      <Toggle id="st-rem" label="Allow “Remember me” (stay signed in for 30 days)" hint="Turn off to make everyone sign in again after the time above." checked={f.allowRemember} onChange={set('allowRemember')} />
      {data?.locked.length > 0 && (
        <div className="sec-locked"><b>Locked accounts</b>
          {data.locked.map((l) => <div key={l.email}><span>{l.email}</span><span className="note">until {new Date(l.until).toLocaleTimeString()}</span><button type="button" className="btn sm" onClick={() => unlock(l.email)}>Unlock</button></div>)}
        </div>
      )}
      <div className="sec-head"><b>Security log</b><span className="note">Sign-ins, failed attempts, lockouts, password and role changes</span></div>
      {log.length ? (
        <div className="tscroll sec-log"><table>
          <thead><tr><th>When</th><th>Event</th><th>Account</th><th>Details</th></tr></thead>
          <tbody>{(showAll ? log : log.slice(0, 8)).map((e, i) => (
            <tr key={i} className={e.ok ? '' : 'bad'}><td style={{ whiteSpace: 'nowrap' }} title={new Date(e.at).toLocaleString()}>{ago(Date.parse(e.at))}</td><td><b>{e.event}</b></td><td>{e.email || '—'}</td><td className="note">{[e.detail, e.ip].filter(Boolean).join(' · ')}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="note" style={{ margin: 0 }}>Nothing yet. Events appear here as people sign in.</p>}
      {log.length > 8 && <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${log.length}`}</button>}
      <div className="am-danger">
        <div><b>Sign out everyone</b><span>Ends every session on every device, for example after a lost laptop or a shared password. You stay signed in.</span></div>
        <button type="button" className="btn ad-no" onClick={() => setConfirm(true)}><Icon name="out" small />Sign out everyone…</button>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Sign out everyone?" subtitle="All admins, instructors and learners have to sign in again. Your own session continues."
        footer={<><button className="btn" onClick={() => setConfirm(false)}>Cancel</button><button className="btn danger" onClick={signOutAll}><Icon name="out" small />Sign out everyone</button></>} />
    </section>
  );
}

/** Email (SMTP): whether it's set up in server/.env, the on/off switch, and a test email. */
function MailCard({ f, set }) {
  const toast = useToast();
  const { data } = useAdminData('/api/admin/mail');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try { const r = await api.post('/api/admin/mail/test', { to }); toast(`Test email sent to ${r.to}`); } catch (x) { toast(x.fields?.to || x.message); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h2><Icon name="send" small />Email</h2>
      <div className="fg"><span className="am-lbl">SMTP server</span>
        <span className={`am-chip ${data?.configured ? 'ok' : ''}`}><Icon name={data?.configured ? 'check' : 'x'} small />{data?.configured ? `${data.host}:${data.port}${data.from ? ` · from ${data.from}` : ''}` : 'Not set up'}</span></div>
      <Toggle id="st-mail" label="Send emails" hint={data?.configured ? 'Off: nothing is emailed to anyone. On: sign-in details, batch emails and request updates can be emailed.' : 'Set up SMTP in server/.env first (see below).'} checked={!!f.emailOn} onChange={set('emailOn')} />
      <div className="temp-pw">
        <Field id="st-test" label="Send a test email to" type="email" value={to} onChange={setTo} placeholder="Your own address" />
        <button type="button" className="btn sm" onClick={test} disabled={busy || !data?.configured}><Icon name="send" small />{busy ? 'Sending…' : 'Send test'}</button>
      </div>
      <p className="note" style={{ margin: 0 }}>The test email works even while sending is off, and only goes to the address you type. SMTP details are kept in <code>server/.env</code> (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM), never in the database. Restart the server after changing them.</p>
    </section>
  );
}

export default function Settings() {
  const toast = useToast();
  const { courses, reload: reloadAll } = useData();
  const { data, error, reload } = useAdminData('/api/admin/settings');
  const [f, setF] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [word, setWord] = useState('');
  const [resetting, setResetting] = useState(false);
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  // every status the courses use (and any ticked one no course has yet), with how many courses have it
  const statusCounts = (() => { const m = new Map(); for (const c of courses) if (c.status) m.set(c.status, (m.get(c.status) || 0) + 1); for (const s of f?.learnerStatuses || []) if (!m.has(s)) m.set(s, 0); return [...m].sort((a, b) => b[1] - a[1]); })();
  const seen = (f?.learnerStatuses || []), shown = statusCounts.filter(([s]) => seen.includes(s)).reduce((a, [, n]) => a + n, 0);
  const flipStatus = (s) => set('learnerStatuses')(seen.includes(s) ? seen.filter((x) => x !== s) : [...seen, s]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const dirty = f && data && JSON.stringify(f) !== JSON.stringify(data.settings);
  const save = async (e) => {
    e?.preventDefault(); setBusy(true); setErr({});
    try { await api.put('/api/admin/settings', f); toast('Settings saved'); await reload(); window.dispatchEvent(new Event('atlas:site')); }
    catch (x) { setErr(x.fields || {}); if (!x.fields || !Object.keys(x.fields).length) toast(x.message); } finally { setBusy(false); }
  };
  const doReset = async () => {
    setResetting(true);
    try { const r = await api.post('/api/admin/reset-data', { confirm: word }); setResetOpen(false); setWord(''); await reloadAll(); reload(); toast(`${r.sample ? 'Sample data restored' : 'All data removed'}. Your old data was saved as ${r.backup}`); }
    catch (x) { toast(x.message); } finally { setResetting(false); }
  };
  return (
    <>
      <PageHead eyebrow="Administration" title="Site Settings" actions={f && <button className="btn primary" onClick={save} disabled={busy || !dirty}><Icon name="save" small />{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!f ? !error && <Loading /> : (
        <form className="am-settings" onSubmit={save} noValidate>
          <section className="card">
            <h2><Icon name="globe" small />General</h2>
            <div className="form">
              <Field id="st-name" label="Platform name" required value={f.siteName} onChange={set('siteName')} error={err.siteName} />
              <Field id="st-mail" label="Support email" type="email" value={f.supportEmail} onChange={set('supportEmail')} error={err.supportEmail} placeholder="support@hazdemy.com" />
              <Field id="st-phone" label="Support phone" type="tel" value={f.supportPhone} onChange={set('supportPhone')} placeholder="+91 98765 43210" />
            </div>
            <p className="note" style={{ margin: 0 }}>The name shows in the browser tab. Support details show on Help &amp; Support and the sign-in page.</p>
          </section>
          <section className="card">
            <h2><Icon name="user" small />Sign-ups</h2>
            <Toggle id="st-ls" label="Learners can create their own account" hint="Turn off to add learners only by assigning courses or importing them." checked={f.learnerSignup} onChange={set('learnerSignup')} />
            <Toggle id="st-is" label="Instructors can request an account" hint="Requests wait for your approval on the dashboard or the Users page." checked={f.instructorSignup} onChange={set('instructorSignup')} />
          </section>
          <section className="card">
            <h2><Icon name="eye" small />What learners can see</h2>
            <p className="note" style={{ margin: 0 }}>Courses with a ticked status show in Explore Courses and can be enrolled in. Learners keep the courses they’re already enrolled in, whatever their status.</p>
            <div className="cat-cols two">{statusCounts.map(([s, n]) => (
              <label key={s} className="cat-opt"><input type="checkbox" checked={seen.includes(s)} onChange={() => flipStatus(s)} /><span>{s}</span><b className="num">{n}</b></label>
            ))}</div>
            <p className="note" style={{ margin: 0 }}><b>{shown}</b> of {courses.length} courses are shown to learners{seen.length ? '' : ': tick at least one status'}. Save to apply.</p>
          </section>
          <MailCard f={f} set={set} />
          <section className="card">
            <h2><Icon name="dollar" small />Payments</h2>
            <div className="form">
              <Field id="st-cur" label="Currency" type="select" options={[{ value: '', label: `Server default (${data.env.envCurrency})` }, ...data.currencies.map((c) => ({ value: c, label: c }))]} hideEmpty value={f.currency} onChange={set('currency')} />
              <div className="fg"><span className="am-lbl">Online payment</span><span className={`am-chip ${data.env.stripe ? 'ok' : ''}`}><Icon name={data.env.stripe ? 'check' : 'x'} small />Stripe {data.env.stripe ? `connected${data.env.testMode ? ' (test mode)' : ''}` : 'not connected'}</span></div>
            </div>
            <p className="note" style={{ margin: 0 }}>Stripe keys are kept in <code>server/.env</code> (STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET), never in the database. Restart the server after changing them. Learners pay on Stripe’s own secure page.{data.env.stripe && !data.env.webhook ? ' Add the webhook secret so payments are recorded even when a learner closes the tab before returning.' : ''}</p>
          </section>
          <SecurityCard f={f} set={set} err={err} />
          <section className="card">
            <h2><Icon name="db" small />Data &amp; backups</h2>
            <p style={{ margin: 0 }}>{num(data.data.courses)} courses · {num(data.data.instructors)} instructors · {num(data.data.learners)} learners · {num(data.data.users)} user accounts, stored in <code>server/data/{data.data.file}</code>.</p>
            <div><a className="btn" href="/api/admin/backup" download><Icon name="download" small />Download a full backup</a></div>
            <div className="am-danger">
              <div><b>Erase all data</b><span>Removes every course, instructor, learner, enrollment, payment and instructor account. Admin accounts stay, so you remain signed in. A backup of the current data is saved first.</span></div>
              <button type="button" className="btn ad-no" onClick={() => setResetOpen(true)}><Icon name="reset" small />Erase data…</button>
            </div>
          </section>
        </form>
      )}
      <Dialog open={resetOpen} onClose={() => { setResetOpen(false); setWord(''); }} title="Erase all data?" subtitle="Courses, instructors, learners, enrollments, payments and instructor accounts are removed. Admin accounts are kept."
        footer={<><button className="btn" onClick={() => { setResetOpen(false); setWord(''); }}>Cancel</button><button className="btn danger" disabled={word !== 'RESET' || resetting} onClick={doReset}><Icon name="reset" small />{resetting ? 'Erasing…' : 'Erase data'}</button></>}>
        <div className="fg"><label htmlFor="st-word">Type <b>RESET</b> to confirm</label><input id="st-word" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" /></div>
      </Dialog>
    </>
  );
}
