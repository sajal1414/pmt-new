import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Field } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { Loading, ErrorNote } from '../shared.jsx';
import { useLearn, useLearnData } from '../lib.jsx';

/** "Get details": the hand-over from the course advisor to the training team. ?course=<id>&subject=… pre-fill the form. */
export default function Contact() {
  const { q, summary } = useLearn();
  const [params] = useSearchParams();
  const { data: courses, loading, error, reload } = useLearnData('/api/learn/advisor');
  const [f, setF] = useState({ courseId: params.get('course') || '', subject: params.get('subject') || '', name: '', email: '', message: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => { setF((s) => ({ ...s, courseId: params.get('course') || s.courseId, subject: params.get('subject') || s.subject })); setSent(false); }, [params]);
  useEffect(() => { const st = summary?.student; if (st) setF((s) => ({ ...s, name: s.name || st.name || '', email: s.email || st.email || '' })); }, [summary]);

  const pickCourse = (id) => {
    const c = (courses || []).find((x) => x.id === id);
    setF((s) => ({ ...s, courseId: id, subject: c ? `Details request: ${c.code} · ${c.name}` : s.subject }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr({});
    try { await api.post(q('/api/learn/enquiries'), f); setSent(true); } catch (x) { setErr({ ...x.fields, form: x.fields && Object.keys(x.fields).length ? '' : x.message }); } finally { setBusy(false); }
  };

  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!courses) return loading && <Loading />;
  const options = [...courses].sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}${c.published ? '' : ' (coming soon)'}` }));
  return (
    <>
      <section className="t-head"><div><h1>Get course details</h1><p>Tell us what you need and our training team will get back to you with details, dates and a quote.</p></div></section>
      {sent ? (
        <section className="card"><div className="empty"><Icon name="check" /><b>Thanks, your request has been sent</b><span>Our team will email you at {f.email} shortly.</span>
          <div className="actions"><Link className="btn sm" to={q('/learn/explore')}>Browse courses</Link><button className="btn sm primary" onClick={() => { setSent(false); setF((s) => ({ ...s, courseId: '', subject: '', message: '' })); }}>Send another request</button></div></div></section>
      ) : (
        <section className="card">
          <form className="form" noValidate onSubmit={submit}>
            <Field id="ct-course" className="full" label="Course" type="select" options={options} value={f.courseId} onChange={pickCourse} />
            <Field id="ct-subject" className="full" label="Subject" value={f.subject} onChange={set('subject')} placeholder="What would you like to know?" />
            <Field id="ct-name" label="Your name" required value={f.name} onChange={set('name')} error={err.name} />
            <Field id="ct-email" label="Email" required value={f.email} onChange={set('email')} error={err.email} />
            <Field id="ct-msg" className="full" label="Message (optional)" type="textarea" value={f.message} onChange={set('message')} placeholder="Number of people, preferred dates, online or onsite…" />
            {err.form && <p className="full" role="alert" style={{ color: 'var(--red-ink)', margin: 0 }}>{err.form}</p>}
            <div className="full"><button className="btn primary" disabled={busy}><Icon name="send" small />{busy ? 'Sending…' : 'Send request'}</button></div>
          </form>
        </section>
      )}
    </>
  );
}
