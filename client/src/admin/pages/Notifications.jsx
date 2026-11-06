import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, Field, PageHead } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useData, useToast } from '../../lib/store.jsx';
import { ago } from '../../lib/constants.js';
import { useAdminData, Loading, ErrorNote, SearchBox, fmtDay } from '../lib.jsx';

const WHO = { all: 'Everyone', learners: 'Learners', instructors: 'Instructors' };

export default function Notifications() {
  const toast = useToast();
  const { reload: reloadAll } = useData();
  const { data, error, reload, setData } = useAdminData('/api/admin/notifications');
  const [f, setF] = useState({ title: '', text: '', audience: 'all' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [del, setDel] = useState(null);
  const log = useMemo(() => { const s = q.trim().toLowerCase(); return (data?.activity || []).filter((a) => !s || a.text.toLowerCase().includes(s)); }, [data, q]);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try { const a = await api.post('/api/admin/announcements', f); setData((d) => ({ ...d, announcements: [a, ...d.announcements] })); setF({ title: '', text: '', audience: f.audience }); toast(`Sent to ${WHO[a.audience].toLowerCase()}`); reload(); }
    catch (x) { setErr(x.fields || {}); if (!x.fields || !Object.keys(x.fields).length) toast(x.message); } finally { setBusy(false); }
  };
  const markRead = async () => { await api.post('/api/activity/read'); reload(); reloadAll(['activity']); toast('All marked as read'); };
  return (
    <>
      <PageHead eyebrow="Communication" title="Notifications" />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (
        <section className="am-two wide-right">
          <div className="am-col">
            <form className="card" onSubmit={send} noValidate>
              <h2 style={{ margin: 0, fontSize: 16 }}><Icon name="send" small /> Send an announcement</h2>
              <p className="note" style={{ margin: 0 }}>It appears in the notification bell of everyone you choose, the next time they open Hazdemy.</p>
              <div className="form" style={{ gridTemplateColumns: '1fr' }}>
                <div className="fg"><span className="am-lbl">Send to</span>
                  <div className="seg-row" role="radiogroup" aria-label="Send to">{Object.entries(WHO).map(([k, l]) => <button key={k} type="button" role="radio" className="seg" aria-checked={f.audience === k} aria-pressed={f.audience === k} onClick={() => setF((s) => ({ ...s, audience: k }))}>{l}</button>)}</div></div>
                <Field id="an-title" label="Title" required value={f.title} onChange={(v) => setF((s) => ({ ...s, title: v }))} error={err.title} placeholder="e.g. New watsonx courses are live" />
                <Field id="an-text" label="Message (optional)" type="textarea" value={f.text} onChange={(v) => setF((s) => ({ ...s, text: v }))} placeholder="A sentence or two with the details" />
              </div>
              <div><button className="btn primary" disabled={busy}><Icon name="send" small />{busy ? 'Sending…' : 'Send announcement'}</button></div>
            </form>
            <section className="card">
              <h2 style={{ margin: 0, fontSize: 16 }}>Sent announcements</h2>
              {data.announcements.length ? <ul className="am-ann">{data.announcements.map((a) => (
                <li key={a.id}><div><b>{a.title}</b>{a.text && <span>{a.text}</span>}<small>{WHO[a.audience]} · {fmtDay(a.at)}</small></div>
                  <button className="icon-btn" onClick={() => setDel(a)} title="Withdraw" aria-label={'Withdraw ' + a.title}><Icon name="trash" small /></button></li>
              ))}</ul> : <p className="note" style={{ margin: 0 }}>Nothing sent yet.</p>}
            </section>
          </div>
          <section className="card">
            <div className="am-th" style={{ padding: 0 }}><h2 style={{ margin: 0, fontSize: 16 }}>Activity log</h2><button className="btn sm" onClick={markRead} disabled={!data.activity.some((a) => !a.read)}><Icon name="check" small />Mark all read</button></div>
            <SearchBox id="nt-q" value={q} onChange={setQ} placeholder="Search the log…" />
            {log.length ? <ul className="am-log">{log.map((a, i) => (
              <li key={i} className={a.read ? '' : 'unread'}><Icon name={a.read ? 'check' : 'bell'} small /><span>{a.text}</span><time title={new Date(a.t).toLocaleString()}>{ago(a.t)}</time></li>
            ))}</ul> : <p className="note">No entries{q ? ' match' : ' yet'}.</p>}
            <p className="note" style={{ margin: 0 }}>The latest 200 changes made in Hazdemy: imports, edits, sign-ups, enrollments and approvals.</p>
          </section>
        </section>
      )}
      <Confirm open={!!del} title="Withdraw this announcement?" message={del && `“${del.title}” disappears from everyone's notifications.`} confirmLabel="Withdraw" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del('/api/admin/announcements/' + del.id); setData((d) => ({ ...d, announcements: d.announcements.filter((x) => x.id !== del.id) })); toast('Announcement withdrawn'); } catch (x) { toast(x.message); } setDel(null); }} />
    </>
  );
}
