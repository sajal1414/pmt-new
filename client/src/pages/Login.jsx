import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import AuthShowcase from '../components/AuthShowcase.jsx';

/** Input with a leading icon; password fields get a show/hide toggle and a Caps Lock warning. */
function AuthField({ id, label, icon, error, type = 'text', hint, aside, ...props }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const pw = type === 'password';
  const checkCaps = (e) => setCaps(!!e.getModifierState?.('CapsLock'));
  const note = error || (pw && caps ? 'Caps Lock is on.' : hint);
  return (
    <div className={`af${error ? ' bad' : ''}`}>
      <div className="af-top"><label htmlFor={id}>{label}</label>{aside}</div>
      <div className="af-in">
        <Icon name={icon} small />
        <input id={id} type={pw && show ? 'text' : type === 'email' ? 'text' : type} inputMode={type === 'email' ? 'email' : undefined}
          aria-invalid={error ? 'true' : 'false'} aria-describedby={note ? id + '-note' : undefined}
          onKeyDown={pw ? checkCaps : undefined} onKeyUp={pw ? checkCaps : undefined} onBlur={() => setCaps(false)} spellCheck="false" {...props} />
        {pw && (
          <button type="button" className="af-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
            <Icon name={show ? 'eyeoff' : 'eye'} small />
          </button>
        )}
      </div>
      {note && <span className={`af-note${error ? ' err' : caps && pw ? ' warn' : ''}`} id={id + '-note'}>{note}</span>}
    </div>
  );
}

function strength(pw) {
  if (!pw) return null;
  const score = [pw.length >= 8, pw.length >= 12, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  return pw.length < 8 ? { score: 1, label: 'Too short' } : !(/[a-z]/i.test(pw) && /\d/.test(pw)) ? { score: 1, label: 'Add letters and a number' } : { score, label: ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}
function StrengthMeter({ value }) {
  const s = strength(value);
  if (!s) return null;
  return (
    <div className={`meter s${s.score}`} aria-live="polite">
      <div className="meter-bars">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= s.score ? 'on' : ''} />)}</div>
      <span>{s.label}</span>
    </div>
  );
}

const Submit = ({ busy, children, busyText }) => (
  <button className="btn primary af-submit" type="submit" disabled={busy}>{busy ? <><span className="spin" aria-hidden="true" />{busyText}</> : children}</button>
);
const Alert = ({ children }) => <p className="login-alert" role="alert"><Icon name="alert" small />{children}</p>;
const blank = { name: '', email: '', password: '', current: '', next: '', confirm: '', role: 'learner' };

export default function Login() {
  const { user, error: bootError, login, changePassword, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  // Where to go after signing in depends on the role: admins land on the admin dashboard, instructors on theirs.
  // The page someone was on before is only reused inside their own area (e.g. an instructor's /teach/messages).
  const saved = loc.state?.from && loc.state.from !== '/login' ? loc.state.from : '';
  const area = { Admin: '/', Instructor: '/teach', Learner: '/learn' }[user?.role] || '/';
  const from = user?.role === 'Admin' ? '/' : saved.startsWith(area) ? saved : area;
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [f, setF] = useState(blank);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const typed = useRef(''); // password used to sign in, reused as "current" when a new one is required
  const set = (k) => (e) => { const v = e.target.value; setF((s) => ({ ...s, [k]: v })); setErr((x) => (x[k] ? { ...x, [k]: '' } : x)); };
  const pending = user?.status === 'Password pending';
  useEffect(() => { setErr({}); setMsg(''); setForgot(false); }, [pending, mode]);

  if (user === undefined) return <div className="boot" aria-busy="true" />;
  if (user && !pending) return <Navigate to={from} replace />;

  const run = async (fn) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (x) { setErr(x.fields || {}); if (!x.fields || x.status !== 422) setMsg(x.message); } finally { setBusy(false); }
  };
  const signIn = (e) => {
    e.preventDefault(); setOk('');
    run(async () => { await login(f.email, f.password, remember); typed.current = f.password; setErr({}); });
  };
  const signUp = (e) => {
    e.preventDefault();
    if (f.password !== f.confirm) { setErr({ confirm: 'Passwords don’t match.' }); return; }
    run(async () => {
      const r = await api.post('/api/signup', { name: f.name, email: f.email, password: f.password, role: f.role });
      setF({ ...blank, email: f.email }); setMode('signin');
      setOk(r.role === 'Learner' ? 'Your learner account is ready. Sign in to start learning.' : 'Instructor account requested. You can sign in once an admin approves it.');
    });
  };
  const setPassword = (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) { setErr({ confirm: 'Passwords don’t match.' }); return; }
    run(async () => {
      try { await changePassword(typed.current || f.current, f.next); }
      catch (x) { if (x.fields?.current && typed.current) { typed.current = ''; x.fields = { current: 'Enter your current password.' }; } throw x; }
      nav(from, { replace: true });
    });
  };
  const switchTo = (m) => { setMode(m); setOk(''); setF((s) => ({ ...blank, email: s.email })); };
  const matchHint = (a, b) => (b && a === b ? 'Passwords match.' : undefined);

  return (
    <div className="auth">
      <section className="auth-visual">
        <div className="brand"><img className="brand-img on-light" src="/brand/hazdemy-logo.png" alt="Hazdemy Learning Services" /><img className="brand-img on-dark" src="/brand/hazdemy-logo-white.png" alt="" aria-hidden="true" /></div>
        <AuthShowcase />
        <div className="auth-copy">
          <h2>Every course, instructor and learner on one map.</h2>
          <p>Plan your catalog, match the right instructors and keep delivery on track.</p>
          <ul className="auth-chips"><li>Course catalog</li><li>Instructor matching</li><li>Excel import</li></ul>
        </div>
      </section>

      <main className="auth-panel">
        <div className="card login-card">
          {pending ? (
            <form className="login-form" noValidate onSubmit={setPassword}>
              <div className="lf-head">
                <span className="lf-badge"><Icon name="lock" /></span>
                <h1>Set your password</h1>
                <p className="note">Signed in as <b>{user.email}</b>. Choose your own password to continue.</p>
              </div>
              <input type="email" autoComplete="username" value={user.email} readOnly hidden />
              {!typed.current && <AuthField id="l-current" label="Current password" icon="lock" type="password" autoComplete="current-password" autoFocus value={f.current} onChange={set('current')} error={err.current} />}
              <div>
                <AuthField id="l-next" label="New password" icon="lock" type="password" autoComplete="new-password" autoFocus={!!typed.current} value={f.next} onChange={set('next')} error={err.password} hint={f.next ? undefined : 'At least 8 characters. Longer is stronger.'} />
                <StrengthMeter value={f.next} />
              </div>
              <AuthField id="l-confirm" label="Confirm new password" icon="lock" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={err.confirm} hint={matchHint(f.next, f.confirm)} />
              {msg && <Alert>{msg}</Alert>}
              <Submit busy={busy} busyText="Saving…">Save and continue</Submit>
              <button className="btn ghost" type="button" onClick={() => { typed.current = ''; logout(); }}>Use a different account</button>
            </form>
          ) : (
            <>
              <div className={`tabs auth-tabs${mode === 'signup' ? ' second' : ''}`} role="tablist" aria-label="Account">
                {[['signin', 'Sign in'], ['signup', 'Sign up']].map(([m, l]) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} aria-controls="auth-form" onClick={() => switchTo(m)}>{l}</button>
                ))}
              </div>
              {mode === 'signin' ? (
                <form id="auth-form" key="in" className="login-form" noValidate onSubmit={signIn}>
                  <div className="lf-head"><h1>Welcome back</h1><p className="note">Sign in to manage courses, instructors and users.</p></div>
                  {ok && <p className="login-ok" role="status"><Icon name="check" small />{ok}</p>}
                  <AuthField id="l-email" label="Email" icon="mail" type="email" placeholder="name@company.com" autoComplete="username" autoFocus={!f.email} value={f.email} onChange={set('email')} error={err.email} />
                  <AuthField id="l-password" label="Password" icon="lock" type="password" placeholder="Your password" autoComplete="current-password" autoFocus={!!f.email} value={f.password} onChange={set('password')} error={err.password}
                    aside={<button type="button" className="linkbtn" onClick={() => setForgot((v) => !v)} aria-expanded={forgot}>Forgot password?</button>} />
                  {forgot && <p className="login-info"><Icon name="shield" small />Ask a Hazdemy admin to set a temporary password for you on the Users page. You’ll choose a new one when you sign in.</p>}
                  <label className="af-check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span>Keep me signed in for 30 days</span></label>
                  {(msg || bootError) && <Alert>{msg || bootError}</Alert>}
                  <Submit busy={busy} busyText="Signing in…">Sign in<Icon name="right" small /></Submit>
                  <p className="note center">New to Hazdemy? <button type="button" className="linkbtn" onClick={() => switchTo('signup')}>Create an account</button></p>
                </form>
              ) : (
                <form id="auth-form" key="up" className="login-form" noValidate onSubmit={signUp}>
                  <div className="lf-head"><h1>Create your account</h1><p className="note">{f.role === 'learner' ? 'Start learning right after you sign up.' : 'An admin approves instructor accounts before they can sign in.'}</p></div>
                  <div className="af-role" role="radiogroup" aria-label="I want to">
                    {[['learner', 'cap', 'I want to learn', 'Take courses and earn certificates'], ['instructor', 'people', 'I want to teach', 'Needs admin approval']].map(([k, ic, t, sub]) => (
                      <button key={k} type="button" role="radio" aria-checked={f.role === k} className={f.role === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, role: k }))}><Icon name={ic} /><span><b>{t}</b><small>{sub}</small></span></button>
                    ))}
                  </div>
                  <AuthField id="s-name" label="Full name" icon="user" placeholder="Jane Doe" autoComplete="name" autoFocus value={f.name} onChange={set('name')} error={err.name} />
                  <AuthField id="s-email" label="Work email" icon="mail" type="email" placeholder="name@company.com" autoComplete="username" value={f.email} onChange={set('email')} error={err.email} />
                  <div>
                    <AuthField id="s-password" label="Password" icon="lock" type="password" placeholder="8+ characters, letters and a number" autoComplete="new-password" value={f.password} onChange={set('password')} error={err.password} />
                    <StrengthMeter value={f.password} />
                  </div>
                  <AuthField id="s-confirm" label="Confirm password" icon="lock" type="password" placeholder="Type it again" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={err.confirm} hint={matchHint(f.password, f.confirm)} />
                  {msg && <Alert>{msg}</Alert>}
                  <Submit busy={busy} busyText="Sending…">{f.role === 'learner' ? 'Create account' : 'Request account'}<Icon name="right" small /></Submit>
                  <p className="note center">Already have an account? <button type="button" className="linkbtn" onClick={() => switchTo('signin')}>Sign in</button></p>
                </form>
              )}
            </>
          )}
        </div>
        <p className="note login-foot"><Icon name="shieldo" small />Secure sign-in · © 2026 Hazdemy</p>
      </main>
    </div>
  );
}
