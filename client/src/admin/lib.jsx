import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Dialog, Field } from '../components/ui.jsx';
import { api } from '../api.js';
import { useData, useToast } from '../lib/store.jsx';
export { Stars, Avatar, CourseThumb } from '../teach/lib.jsx';

/** GET a JSON endpoint; `reload` fetches again, `setData` updates in place after a change. */
export function useAdminData(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return api.get(url).then((d) => { setData(d); setError(''); }, (e) => setError(e.message)).finally(() => setLoading(false));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export const Loading = ({ what = 'Loading…' }) => <p className="note" role="status">{what}</p>;
export const ErrorNote = ({ error, retry }) => (
  <div className="card" role="alert" style={{ borderColor: 'var(--red-line)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <b style={{ color: 'var(--red-ink)' }}>{error}</b>{retry && <button className="btn sm" onClick={retry}>Try again</button>}
  </div>
);

export const num = (n) => (+n || 0).toLocaleString('en-US');
export const fmtMoney = (n, cur = 'USD') => { try { return (+n || 0).toLocaleString('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }); } catch { return `${cur} ${num(n)}`; } };
export const fmtDay = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
export const today = () => new Date().toISOString().slice(0, 10);

/** Row of small headline numbers above a table. */
export function Stats({ items }) {
  return (
    <section className="am-stats">{items.map(([label, value, tone, sub]) => (
      <div key={label} className={`am-stat ${tone || ''}`}><span>{label}</span><b className="num">{value}</b>{sub && <small>{sub}</small>}</div>
    ))}</section>
  );
}

const STATUS_TONE = { Completed: 'ok', 'In progress': 'acc', 'Not started': 'gone', Overdue: 'red', paid: 'ok', pending: 'warn', created: 'warn', failed: 'red', refunded: 'gone' };
export const Tag = ({ children, tone }) => <span className={`pill ${tone || STATUS_TONE[children] || 'gone'}`}>{children}</span>;

export function Progress({ value }) {
  return <span className="am-prog" title={`${value}%`}><span><i style={{ width: `${value}%` }} /></span><b className="num">{value}%</b></span>;
}

/** Enroll or assign learners to a course by email, with an optional deadline. */
export function AssignDialog({ open, onClose, onDone, courseId: fixed }) {
  const { courses } = useData();
  const toast = useToast();
  const [f, setF] = useState({ courseId: '', emails: '', deadline: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF({ courseId: fixed || '', emails: '', deadline: '' }); setErr({}); } }, [open, fixed]);
  const save = async () => {
    setBusy(true); setErr({});
    try {
      const r = await api.post('/api/admin/enrollments', f);
      toast(`${r.assigned} learner${r.assigned === 1 ? '' : 's'} assigned${r.updated ? `, ${r.updated} already enrolled (deadline updated)` : ''}${r.newLearners ? `, ${r.newLearners} new learner${r.newLearners === 1 ? '' : 's'} created` : ''}`);
      onDone?.(); onClose();
    } catch (x) { setErr(x.fields || {}); if (!x.fields || !Object.keys(x.fields).length) toast(x.message); } finally { setBusy(false); }
  };
  const opts = [...courses].sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }));
  return (
    <Dialog open={open} onClose={onClose} title="Assign a course" subtitle="Learners get it in My Learning straight away. New email addresses get a learner record."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}><Icon name="send" small />{busy ? 'Assigning…' : 'Assign course'}</button></>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <Field id="as-course" label="Course" type="select" options={opts} value={f.courseId} onChange={(v) => setF((s) => ({ ...s, courseId: v }))} error={err.courseId} />
        <Field id="as-emails" label="Learner emails" type="textarea" required placeholder="One or more emails, separated by commas or new lines" value={f.emails} onChange={(v) => setF((s) => ({ ...s, emails: v }))} error={err.emails} />
        <Field id="as-deadline" label="Deadline (optional)" type="date" value={f.deadline} onChange={(v) => setF((s) => ({ ...s, deadline: v }))} error={err.deadline} />
      </div>
    </Dialog>
  );
}

/** Sorting and paging state for a DataTable. */
export function useTable(defaultSort = { key: 'date', dir: -1 }) {
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  return {
    sort, page, size, setPage,
    props: { sort, page, size, onSort: (k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 })), onPage: setPage, onSize: (n) => { setSize(n); setPage(1); } }
  };
}

export function SearchBox({ id, value, onChange, placeholder }) {
  return <label className="field grow" htmlFor={id}><Icon name="search" small /><span className="sr">Search</span><input id={id} type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" /></label>;
}
