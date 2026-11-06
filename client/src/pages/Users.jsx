import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Confirm, DataTable, Dialog, Field, PageHead, EmptyState, sortRows } from '../components/ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { ROLES, initials } from '../lib/constants.js';
import { TempPassword } from '../components/InstructorAccounts.jsx';

function UserForm({ open, record, onClose }) {
  const { reload, instructors } = useData();
  const toast = useToast();
  const [f, setF] = useState({});
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(record ? { ...record, password: '' } : { email: '', name: '', password: '' }); setErr({}); } }, [open, record]);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (record) await api.put('/api/users/' + record.id, f); else await api.post('/api/users', f);
      await reload(['users', 'activity']);
      toast(record ? (f.password ? `Saved. ${f.email} can now sign in with ${f.password}` : 'Saved ' + (f.name || f.email)) : `Created ${f.email} with password ${f.password}. They’ll set their own at first sign-in.`); onClose();
    } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={record ? 'Edit user' : 'New user'} subtitle={record?.email}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="userForm" disabled={busy}>{record ? 'Save changes' : 'Create user'}</button></>}>
      <form id="userForm" className="form" noValidate onSubmit={submit}>
        <Field id="u-email" className="full" label="Email" type="email" required value={f.email} onChange={set('email')} error={err.email} />
        <Field id="u-name" className="full" label="Full name" value={f.name} onChange={set('name')} error={err.name} />
        <TempPassword id="u-password" label={record ? 'New temporary password' : 'Temporary password'} required={!record} placeholder={record ? 'Leave blank to keep the current one' : 'Type one, or click Generate'}
          value={f.password} onChange={set('password')} error={err.password} />
        {record && <Field id="u-role" label="Role" type="select" options={ROLES} required hideEmpty value={f.role} onChange={set('role')} error={err.role} />}
        {record && f.role === 'Instructor' && (
          <Field id="u-inst" className="full" label="Instructor profile" type="select" required value={f.instructorId} onChange={set('instructorId')} error={err.instructorId}
            options={[{ value: '', label: 'Select…' }, ...instructors.map((i) => ({ value: i.id, label: `${i.name} (${i.email})` }))]} hideEmpty />
        )}
      </form>
      <p className="note" style={{ margin: 0 }}>{record ? 'Setting a temporary password signs them out; they choose a new one at next sign-in.' : 'They’ll be required to set their own password the first time they sign in.'}</p>
    </Dialog>
  );
}

export default function Users() {
  const { users, reload } = useData();
  const toast = useToast();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || ''); // the top-bar search links here with ?q=
  useEffect(() => { if (params.get('q') != null) setQ(params.get('q')); }, [params]);
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [error, setError] = useState('');
  const rows = useMemo(() => { const s = q.trim().toLowerCase(); return sortRows(users.filter((u) => !s || [u.name, u.email, u.role].join(' ').toLowerCase().includes(s)), sort); }, [users, q, sort]);
  const admins = users.filter((u) => u.role === 'Admin').length;
  const cols = [
    { key: 'name', label: 'Name', sortable: true, tdClass: 'strong', render: (u) => <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="avatar" style={{ width: 30, height: 30, fontSize: 12, ...(u.role === 'Admin' ? {} : { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }) }}>{initials(u.name || u.email)}</span>{u.name || '—'}</span> },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Role', sortable: true, render: (u) => <span className={`pill ${u.role === 'Admin' ? 'red' : 'gone'}`}>{u.role}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (u) => <span className={`pill ${u.status === 'Active' ? 'ok' : 'warn'}`}><span className="d" />{u.status}</span> }
  ];
  const toDelete = users.find((u) => u.id === del);
  return (
    <>
      <PageHead eyebrow="Admin" title="Users"
        summary={['Active', 'Password pending', 'Pending approval'].filter((s) => s !== 'Pending approval' || users.some((u) => u.status === s)).map((s) => <span key={s} className={`pill ${s === 'Active' ? 'ok' : 'warn'}`}>{s} · {users.filter((u) => u.status === s).length}</span>)}
        actions={<button className="btn primary" onClick={() => setForm({ record: null })}><Icon name="plus" small />New user</button>} />
      <section className="toolbar" aria-label="Filters">
        <label className="field grow" htmlFor="u-q"><Icon name="search" small /><span className="sr">Search</span><input id="u-q" type="search" placeholder="Search name, email or role…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} autoComplete="off" /></label>
      </section>
      {error && <p className="err" role="alert">{error}</p>}
      <DataTable cols={cols} rows={rows} noun="users" sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
        actions={(u) => <>
          {u.status === 'Pending approval' && <button onClick={async () => { try { await api.post(`/api/users/${u.id}/approve`); await reload(['users', 'activity']); toast('Approved ' + (u.name || u.email)); } catch (e) { setError(e.message); } }} aria-label={'Approve ' + (u.name || u.email)} title="Approve sign-up"><Icon name="check" small /></button>}
          <button onClick={() => setForm({ record: u })} aria-label={'Edit ' + (u.name || u.email)} title="Edit"><Icon name="edit" small /></button>
          {!(u.role === 'Admin' && admins < 2) && <button className="del" onClick={() => setDel(u.id)} aria-label={'Delete ' + (u.name || u.email)} title="Delete"><Icon name="trash" small /></button>}
        </>}
        empty={<EmptyState title="No users match" text="Try a different search." />} />
      <UserForm open={!!form} record={form?.record} onClose={() => setForm(null)} />
      <Confirm open={!!toDelete} title="Delete user?" message={toDelete ? `This removes ${toDelete.name || toDelete.email} from Hazdemy.` : ''} confirmLabel="Delete user" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del('/api/users/' + del); await reload(['users', 'activity']); toast('Deleted ' + (toDelete.name || toDelete.email)); } catch (e) { setError(e.message); } setDel(null); }} />
    </>
  );
}
