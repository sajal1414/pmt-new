import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/store.jsx';
import { useTeach, useTeachData, Avatar, Loading, ErrorNote } from '../lib.jsx';
import SignaturePad from '../SignaturePad.jsx';

const TRAVEL = ['Can Travel', 'Virtual Only', 'In Person Only', 'Both'];
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export default function Profile() {
  const { q, admin, reloadSummary } = useTeach();
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useTeachData('/api/teach/profile');
  const [f, setF] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [theme, setTheme] = useState(read('atlas-theme') || 'system');
  useEffect(() => { if (data) setF({ ...data, platforms: (data.platforms || []).join(', ') }); }, [data]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try { await api.put(q('/api/teach/profile'), f); toast('Profile saved'); reload(); reloadSummary(); }
    catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setPwErr({ confirm: 'Passwords don’t match.' }); return; }
    try { await changePassword(pw.current, pw.next); setPw({ current: '', next: '', confirm: '' }); setPwErr({}); toast('Password changed'); }
    catch (x) { setPwErr(x.fields || {}); if (!x.fields) toast(x.message); }
  };
  const pickTheme = (t) => { setTheme(t); write('atlas-theme', t); if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); };

  return (
    <>
      <section className="t-head"><div><h1>Profile &amp; Settings</h1><p>{admin ? 'You’re viewing this instructor’s profile as an admin.' : 'How you appear to admins and learners, and your account settings.'}</p></div></section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!f ? loading && <Loading /> : (
        <div className="t-two wide-left">
          <section className="card">
            <div className="t-prof"><Avatar name={f.name} size={64} /><div><h2>{f.name}</h2><span className="note">{f.email}</span></div></div>
            <form className="form" noValidate onSubmit={save}>
              <Field id="p-name" label="Full name" required value={f.name} onChange={set('name')} error={err.name} />
              <div className="fg"><label htmlFor="p-email">Email</label><input id="p-email" value={f.email} readOnly disabled /><span className="note">Ask an admin to change your email.</span></div>
              <Field id="p-phone" label="Telephone" type="tel" value={f.phone || ''} onChange={set('phone')} placeholder="e.g. +91 98765 43210" error={err.phone} />
              <Field id="p-loc" label="Location" value={f.location} onChange={set('location')} placeholder="City, Country" />
              <Field id="p-travel" label="Travel" type="select" options={TRAVEL} value={f.travel} onChange={set('travel')} />
              <Field id="p-lang" label="Languages" value={f.languages} onChange={set('languages')} placeholder="English, Hindi" />
              <Field id="p-plat" label="Platforms" value={f.platforms} onChange={set('platforms')} placeholder="Data, Security, Cloud" />
              <Field id="p-skills" className="full" label="Skills" value={f.skills} onChange={set('skills')} placeholder="DataStage, watsonx.data, QRadar…" />
              <Field id="p-can" className="full" label="Courses you can teach" value={f.canTeach} onChange={set('canTeach')} placeholder="Course codes or names" />
              <Field id="p-bio" className="full" label="About you" type="textarea" value={f.comments} onChange={set('comments')} placeholder="A short bio learners and admins will see" />
              <div className="full"><button className="btn primary" disabled={busy}><Icon name="save" small />{busy ? 'Saving…' : 'Save profile'}</button></div>
            </form>
          </section>
          <div className="t-col">
            <SignaturePad endpoint={q('/api/teach/profile/signature')} preview={q('/api/teach/profile/certificate-preview')} value={f.signature || ''} onSaved={(signature) => setF((s) => ({ ...s, signature }))} />
            <section className="card">
              <h2>Password</h2>
              {admin ? <p className="note" style={{ margin: 0 }}>Signed in as {user.email}. Instructors change their own password here; as an admin you can set a temporary password on the Users page.</p> : (
                <form className="form" noValidate onSubmit={savePw} style={{ gridTemplateColumns: '1fr' }}>
                  <Field id="pw-cur" label="Current password" type="password" value={pw.current} onChange={(v) => setPw((s) => ({ ...s, current: v }))} error={pwErr.current} />
                  <Field id="pw-new" label="New password" type="password" value={pw.next} onChange={(v) => setPw((s) => ({ ...s, next: v }))} error={pwErr.password} />
                  <Field id="pw-con" label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw((s) => ({ ...s, confirm: v }))} error={pwErr.confirm} />
                  <div><button className="btn" disabled={!pw.current || !pw.next}><Icon name="lock" small />Change password</button></div>
                </form>
              )}
            </section>
            <section className="card">
              <h2>Appearance</h2>
              <div className="seg-row">{[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Match system']].map(([t, ic, l]) => <button key={t} type="button" className="seg" aria-pressed={theme === t} onClick={() => pickTheme(t)}><Icon name={ic} small /> {l}</button>)}</div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
