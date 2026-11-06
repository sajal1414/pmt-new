import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Dialog } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useTeach, useTeachData, Avatar, Loading, ErrorNote, ago } from '../lib.jsx';

const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Messages() {
  const { q, reloadSummary } = useTeach();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload, setData } = useTeachData('/api/teach/messages');
  const { data: students } = useTeachData('/api/teach/students');
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(null); // { studentId, text }
  const end = useRef(null);
  const activeId = params.get('thread');
  const setParam = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const list = useMemo(() => { const s = text.trim().toLowerCase(); return (data || []).filter((t) => !s || `${t.student} ${t.course} ${t.last.text}`.toLowerCase().includes(s)); }, [data, text]);
  const active = (data || []).find((t) => t.id === activeId) || null;

  // ?to=<studentId> (from Students): open their conversation, or start a new one
  useEffect(() => {
    const to = params.get('to');
    if (!to || !data) return;
    const t = data.find((x) => x.studentId === to);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('to'); if (t) n.set('thread', t.id); return n; }, { replace: true });
    if (!t) setCompose({ studentId: to, text: '' });
  }, [params, data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!activeId && list.length && window.innerWidth > 900) setParam('thread', list[0].id); }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active?.unread) api.post(q(`/api/teach/messages/${active.id}/read`)).then(() => { setData((d) => d.map((t) => (t.id === active.id ? { ...t, unread: false } : t))); reloadSummary(); }).catch(() => {});
    end.current?.scrollIntoView({ block: 'end' });
  }, [active?.id, active?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try { const t = await api.post(q(`/api/teach/messages/${active.id}`), { text: reply }); setData((d) => d.map((x) => (x.id === t.id ? t : x))); setReply(''); }
    catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  const start = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const t = await api.post(q('/api/teach/messages'), compose); await reload(); setParam('thread', t.id); setCompose(null); toast('Message sent'); }
    catch (x) { toast(x.message); } finally { setBusy(false); }
  };

  return (
    <>
      <section className="t-head">
        <div><h1>Messages</h1><p>Conversations with learners in your courses.</p></div>
        <button className="btn primary" onClick={() => setCompose({ studentId: '', text: '' })}><Icon name="plus" small />New message</button>
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (
        <section className={`card t-msgs${active ? ' has-active' : ''}`}>
          <div className="t-threads">
            <label className="field"><Icon name="search" small /><span className="sr">Search messages</span><input type="search" placeholder="Search messages…" value={text} onChange={(e) => setText(e.target.value)} /></label>
            <ul>{list.map((t) => (
              <li key={t.id}><button className={`${t.id === activeId ? 'on' : ''}${t.unread ? ' unread' : ''}`} onClick={() => setParam('thread', t.id)}>
                <Avatar name={t.student} size={36} />
                <span className="tx"><span className="t-rh"><b>{t.student}</b><time>{ago(t.last.at)}</time></span><span className="pv">{t.last.from === 'instructor' ? 'You: ' : ''}{t.last.text}</span></span>
                {t.unread && <span className="dot" aria-label="Unread" />}
              </button></li>
            ))}{!list.length && <li className="note" style={{ padding: 12 }}>{data.length ? 'No conversations match.' : 'No messages yet.'}</li>}</ul>
          </div>
          <div className="t-thread">
            {active ? (<>
              <div className="t-th-head">
                <button className="icon-btn t-th-back" onClick={() => setParam('thread', '')} aria-label="Back to conversations"><Icon name="back" small /></button>
                <Avatar name={active.student} size={38} /><div><b>{active.student}</b><span className="note">{active.email}{active.course ? ` · ${active.course}` : ''}</span></div>
              </div>
              <div className="t-bubbles">
                {active.messages.map((m, i) => <div key={i} className={`t-bubble ${m.from}`}><p>{m.text}</p><time>{when(m.at)}</time></div>)}
                <div ref={end} />
              </div>
              <form className="t-compose" onSubmit={send}>
                <label className="sr" htmlFor="tReply">Reply</label>
                <textarea id="tReply" rows={2} placeholder={`Reply to ${active.student.split(' ')[0]}…`} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} />
                <button className="btn primary" disabled={busy || !reply.trim()}><Icon name="send" small />Send</button>
              </form>
            </>) : <div className="empty"><Icon name="msg" /><b>Select a conversation</b><span>Or start a new message to a learner.</span></div>}
          </div>
        </section>
      )}
      <Dialog open={!!compose} onClose={() => setCompose(null)} title="New message" subtitle="Write to a learner enrolled in one of your courses."
        footer={<><button className="btn" onClick={() => setCompose(null)}>Cancel</button><button className="btn primary" type="submit" form="tCompose" disabled={busy || !compose?.studentId || !compose?.text.trim()}><Icon name="send" small />Send</button></>}>
        {compose && (
          <form id="tCompose" className="form" onSubmit={start}>
            <div className="fg full"><label htmlFor="tTo">To</label>
              <select id="tTo" value={compose.studentId} onChange={(e) => setCompose((c) => ({ ...c, studentId: e.target.value }))}>
                <option value="">Choose a learner…</option>{(students || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
              </select></div>
            <div className="fg full"><label htmlFor="tText">Message</label><textarea id="tText" className="plain" value={compose.text} onChange={(e) => setCompose((c) => ({ ...c, text: e.target.value }))} /></div>
          </form>
        )}
      </Dialog>
    </>
  );
}
