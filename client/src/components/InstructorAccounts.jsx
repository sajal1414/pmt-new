import Icon from './Icon.jsx';
import { Dialog, Field, downloadText, toCSV } from './ui.jsx';
import { useState } from 'react';
import { useToast } from '../lib/store.jsx';
import { useSite } from '../lib/site.js';
import { api } from '../api.js';

/**
 * The sign-ins just made for instructors: email and temporary password, shown once.
 * Each instructor is asked for a new password the first time they sign in.
 */
export default function InstructorAccounts({ accounts, onClose, who = 'instructor' }) {
  const toast = useToast();
  const site = useSite();
  const [sending, setSending] = useState(false);
  const list = accounts || [];
  const email = async () => {
    setSending(true);
    try { const r = await api.post('/api/mail/sign-ins', { accounts: list }); toast(`Emailed ${r.sent} sign-in${r.sent === 1 ? '' : 's'}${r.failed.length ? `; ${r.failed.length} not sent` : ''}`); }
    catch (e) { toast(e.message); } finally { setSending(false); }
  };
  const text = list.map((a) => `${a.name}\t${a.email}\t${a.password}`).join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy didn’t work. Use Download CSV.'); } };
  return (
    <Dialog open={list.length > 0} onClose={onClose} wide title={list.length === 1 ? `${who === 'learner' ? 'New learner' : 'Instructor'} sign-in` : `${list.length} ${who === 'learner' ? 'new learner' : 'instructor'} sign-ins`}
      subtitle={`Send each ${who} their email and temporary password. They’ll set their own password the first time they sign in. The passwords aren’t shown again.`}
      footer={<>
        {site.mail && <button className="btn" onClick={email} disabled={sending}><Icon name="send" small />{sending ? 'Sending…' : list.length === 1 ? 'Email the sign-in' : 'Email them their sign-ins'}</button>}
        <button className="btn" onClick={copy}><Icon name="copy" small />Copy</button>
        <button className="btn" onClick={() => downloadText(toCSV(list, ['name', 'email', 'password']), `hazdemy-${who}-sign-ins-${new Date().toISOString().slice(0, 10)}.csv`)}><Icon name="download" small />Download CSV</button>
        <button className="btn primary" onClick={onClose}>Done</button>
      </>}>
      <div className="tscroll" style={{ maxHeight: 360, overflow: 'auto' }}>
        <table>
          <thead><tr><th>Name</th><th>Email (sign-in)</th><th>Temporary password</th></tr></thead>
          <tbody>{list.map((a) => <tr key={a.email}><td>{a.name}</td><td>{a.email}</td><td><code>{a.password}</code></td></tr>)}</tbody>
        </table>
      </div>
    </Dialog>
  );
}

// a temporary password like Hz3f9a1c07d244: letters and numbers, nothing to guess
export const makePassword = () => 'Hz' + [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join('') + (10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 90));

/** A temporary password box, shown as plain text so it can be passed on, with a Generate button. */
export function TempPassword({ id, label, value, onChange, error, placeholder, required }) {
  return (
    <div className="full temp-pw">
      <Field id={id} label={label} value={value} onChange={onChange} error={error} placeholder={placeholder} required={required} />
      <button type="button" className="btn sm" onClick={() => onChange(makePassword())} title="Make a random temporary password"><Icon name="lock" small />Generate</button>
    </div>
  );
}
