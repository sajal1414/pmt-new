import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Confirm, DataTable, EmptyState, PageHead, sortRows, downloadText, toCSV } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useAdminData, useTable, Loading, ErrorNote, Stats, Tag, SearchBox, num, fmtMoney, fmtDay } from '../lib.jsx';

const METHOD = { cod: 'Cash on delivery', razorpay: 'Razorpay' };

export default function Payments() {
  const toast = useToast();
  const { data, error, reload } = useAdminData('/api/admin/payments');
  const t = useTable({ key: 'at', dir: -1 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [change, setChange] = useState(null); // { p, status }
  // totals use the currency the payments were taken in (they keep it even if the setting changes later)
  const all = data?.payments || [], cur = all[0]?.currency || data?.config.currency || 'USD';
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortRows(all.filter((p) => (!s || [p.student, p.email, p.course, p.code, p.id, p.orderId, p.paymentId].join(' ').toLowerCase().includes(s)) && (!status || p.status === status) && (!method || p.method === method)), t.sort);
  }, [all, q, status, method, t.sort]);
  const apply = async () => {
    try { await api.post(`/api/admin/payments/${change.p.id}/status`, { status: change.status }); toast(`Payment marked ${change.status}`); reload(); } catch (x) { toast(x.message); }
    setChange(null);
  };
  const cols = [
    { key: 'at', label: 'Date', sortable: true, tdStyle: { whiteSpace: 'nowrap' }, render: (p) => fmtDay(p.at) },
    { key: 'student', label: 'Learner', sortable: true, render: (p) => <span className="two"><b style={{ color: 'var(--ink)' }}>{p.student}</b><span>{p.email}</span></span> },
    { key: 'course', label: 'Course', sortable: true, tdStyle: { minWidth: 220 }, render: (p) => <span className="two"><Link className="rowlink" to={'/courses/' + p.courseId}>{p.course}</Link><span>{p.code}</span></span> },
    { key: 'method', label: 'Method', sortable: true, render: (p) => <span className="two"><span style={{ color: 'var(--ink)' }}>{METHOD[p.method] || p.method}</span>{(p.paymentId || p.orderId) && <span className="code">{p.paymentId || p.orderId}</span>}</span> },
    { key: 'amount', label: 'Amount', sortable: true, tdClass: 'num', tdStyle: { textAlign: 'right', fontWeight: 600 }, render: (p) => fmtMoney(p.amount, p.currency || cur) },
    { key: 'status', label: 'Status', sortable: true, render: (p) => <Tag>{p.status}</Tag> }
  ];
  return (
    <>
      <PageHead eyebrow="Finance" title="Payments"
        actions={<button className="btn" disabled={!rows.length} onClick={() => downloadText(toCSV(rows, ['at', 'id', 'student', 'email', 'code', 'course', 'method', 'orderId', 'paymentId', 'amount', 'currency', 'status']), 'atlas-payments.csv')}><Icon name="download" small />Export CSV</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <div className="am-paycfg">
          <span><Icon name="dollar" small />Currency <b>{cur}</b></span>
          <span className={data.config.razorpay ? 'ok' : 'off'}><Icon name={data.config.razorpay ? 'check' : 'x'} small />Razorpay {data.config.razorpay ? 'connected' : 'not set up (add keys to server/.env)'}</span>
          <span className={data.config.cod ? 'ok' : 'off'}><Icon name={data.config.cod ? 'check' : 'x'} small />Cash on delivery {data.config.cod ? 'on' : 'off'}</span>
          <Link className="linkbtn" to="/settings">Payment settings →</Link>
        </div>
        <Stats items={[['Received', fmtMoney(data.totals.paid, cur), 'ok'], ['Pending (COD / unpaid)', fmtMoney(data.totals.pending, cur), 'warn'], ['Refunded', fmtMoney(data.totals.refunded, cur)], ['Failed payments', num(data.totals.failed), data.totals.failed ? 'red' : ''], ['Transactions', num(all.length)]]} />
        {data.otherEnrollments > 0 && <p className="note" style={{ margin: 0 }}>{num(data.otherEnrollments)} more enrollments carry an amount from imported or sample learner data. They have no payment record, but they count in Reports revenue.</p>}
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="py-q" value={q} onChange={(v) => { setQ(v); t.setPage(1); }} placeholder="Search learner, course or payment ID…" />
          <select className="sel" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); t.setPage(1); }}><option value="">All statuses</option>{['paid', 'pending', 'created', 'failed', 'refunded'].map((s) => <option key={s}>{s}</option>)}</select>
          <select className="sel" aria-label="Method" value={method} onChange={(e) => { setMethod(e.target.value); t.setPage(1); }}><option value="">All methods</option>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </section>
        <DataTable cols={cols} rows={rows} {...t.props} noun="payments" empty={<EmptyState title={all.length ? 'No payments match' : 'No payments yet'} text={all.length ? 'Try another filter.' : 'Payments appear here when learners buy a course.'} />}
          actions={(p) => <>
            {p.status !== 'paid' && <button onClick={() => setChange({ p, status: 'paid' })} title="Mark as paid" aria-label={'Mark payment from ' + p.student + ' as paid'}><Icon name="check" small /></button>}
            {p.status === 'paid' && <button onClick={() => setChange({ p, status: 'refunded' })} title="Mark as refunded" aria-label={'Mark payment from ' + p.student + ' as refunded'}><Icon name="reset" small /></button>}
          </>} />
      </>)}
      <Confirm open={!!change} title={change?.status === 'paid' ? 'Mark this payment as paid?' : 'Mark this payment as refunded?'}
        message={change && (change.status === 'paid' ? `Confirms ${fmtMoney(change.p.amount, change.p.currency || cur)} from ${change.p.student} was received${change.p.method === 'cod' ? ' (cash on delivery)' : ''}.` : `Records that ${fmtMoney(change.p.amount, change.p.currency || cur)} was returned to ${change.p.student}. This only updates Hazdemy; refund the money in Razorpay or by hand.`)}
        confirmLabel={change?.status === 'paid' ? 'Mark paid' : 'Mark refunded'} onClose={() => setChange(null)} onConfirm={apply} />
    </>
  );
}
