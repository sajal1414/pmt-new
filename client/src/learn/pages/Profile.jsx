import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Field } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../../lib/store.jsx';
import { Loading, ErrorNote, Avatar } from '../shared.jsx';
import { useLearn, useLearnData } from '../lib.jsx';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export default function Profile() {
  const { q, admin, reloadSummary } = useLearn();
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLearnData('/api/learn/profile');
  const { data: cat } = useLearnData('/api/learn/catalog');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState({});
  const [theme, setTheme] = useState(read('atlas-theme') || 'system');
  useEffect(() => { if (data) setF({ name: data.name, location: data.location || '', bio: data.bio || '', goals: { interests: [], level: '', weeklyHours: '', goal: '', ...(data.goals || {}) } }); }, [data]);
  const setG = (k, v) => setF((s) => ({ ...s, goals: { ...s.goals, [k]: v } }));
  const save = async (e) => { e.preventDefault(); setBusy(true); setErr({}); try { await api.put(q('/api/learn/profile'), f); toast('Profile saved'); reload(); reloadSummary(); } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); } };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) { setPwErr({ confirm: 'Passwords don’t match.' }); return; }
    try { await changePassword(pw.current, pw.next); setPw({ current: '', next: '', confirm: '' }); setPwErr({}); toast('Password changed'); } catch (x) { setPwErr(x.fields || {}); if (!x.fields) toast(x.message); }
  };
  const pickTheme = (t) => { setTheme(t); write('atlas-theme', t); if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); };
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!f) return loading && <Loading />;
  return (
    <>
      <section className="t-head"><div><h1>Profile &amp; Settings</h1><p>{admin ? 'You’re viewing this learner’s profile as an admin.' : 'Your details, learning goals and account settings.'}</p></div></section>
      <div className="t-two wide-left">
        <section className="card">
          <div className="t-prof"><Avatar name={f.name} size={64} /><div><h2>{f.name}</h2><span className="note">{data.email}</span></div></div>
          <form className="form" noValidate onSubmit={save}>
            <Field id="lp-name" label="Full name" required value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} error={err.name} />
            <Field id="lp-loc" label="Location" value={f.location} onChange={(v) => setF((s) => ({ ...s, location: v }))} placeholder="City, Country" />
            <Field id="lp-bio" className="full" label="About you" type="textarea" value={f.bio} onChange={(v) => setF((s) => ({ ...s, bio: v }))} placeholder="Your role and what you want to learn" />
            <div className="fg full"><span className="lbl" style={{ fontSize: 13, fontWeight: 600 }}>Interests (used for recommendations)</span>
              <div className="l-chips">{(cat?.categories || []).map((c) => <button key={c.name} type="button" className="seg" aria-pressed={f.goals.interests.includes(c.name)} onClick={() => setG('interests', f.goals.interests.includes(c.name) ? f.goals.interests.filter((x) => x !== c.name) : [...f.goals.interests, c.name])}>{c.name}</button>)}</div></div>
            <Field id="lp-level" label="Experience level" type="select" options={['Beginner', 'Intermediate', 'Advanced']} value={f.goals.level} onChange={(v) => setG('level', v)} />
            <Field id="lp-week" label="Hours per week" type="select" options={['1-2', '3-5', '6-10', '10+']} value={f.goals.weeklyHours} onChange={(v) => setG('weeklyHours', v)} />
            <Field id="lp-goal" className="full" label="Learning goal" value={f.goals.goal} onChange={(v) => setG('goal', v)} placeholder="e.g. Get IBM certified in data integration" />
            <div className="full"><button className="btn primary" disabled={busy}><Icon name="save" small />{busy ? 'Saving…' : 'Save profile'}</button></div>
          </form>
        </section>
        <div className="t-col">
          <section className="card">
            <h2>Password</h2>
            {admin ? <p className="note" style={{ margin: 0 }}>Signed in as {user.email}. Learners change their own password here.</p> : (
              <form className="form" noValidate onSubmit={savePw} style={{ gridTemplateColumns: '1fr' }}>
                <Field id="lpw-c" label="Current password" type="password" value={pw.current} onChange={(v) => setPw((s) => ({ ...s, current: v }))} error={pwErr.current} />
                <Field id="lpw-n" label="New password" type="password" value={pw.next} onChange={(v) => setPw((s) => ({ ...s, next: v }))} error={pwErr.password} />
                <Field id="lpw-f" label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw((s) => ({ ...s, confirm: v }))} error={pwErr.confirm} />
                <div><button className="btn" disabled={!pw.current || !pw.next}><Icon name="lock" small />Change password</button></div>
              </form>
            )}
          </section>
          <section className="card"><h2>Appearance</h2><div className="seg-row">{[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Match system']].map(([t, ic, l]) => <button key={t} type="button" className="seg" aria-pressed={theme === t} onClick={() => pickTheme(t)}><Icon name={ic} small /> {l}</button>)}</div></section>
        </div>
      </div>
    </>
  );
}
