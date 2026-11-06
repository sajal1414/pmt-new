import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Dialog } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { Loading, ErrorNote, Avatar, ago } from '../shared.jsx';
import { useLearn, useLearnData } from '../lib.jsx';

const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Messages() {
  const { q, reloadSummary } = useLearn();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload, setData } = useLearnData('/api/learn/messages');
  const { data: mine } = useLearnData('/api/learn/enrollments');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(null); // { courseId, text }
  const end = useRef(null);
  const activeId = params.get('thread');
  const setParam = (k, v) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const active = (data || []).find((t) => t.id === activeId) || null;
  const courses = useMemo(() => (mine || []).filter((e) => e.course.instructor.id), [mine]);

  useEffect(() => { // ?course=<id> (from a course page): open that instructor's conversation or start one
    const cid = params.get('course');
    if (!cid || !data || !mine) return;
    const inst = mine.find((e) => e.course.id === cid)?.course.instructor.id;
    const t = data.find((x) => x.instructorId === inst);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('course'); if (t) n.set('thread', t.id); return n; }, { replace: true });
    if (!t) setCompose({ courseId: cid, text: '' });
  }, [params, data, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!activeId && data?.length && window.innerWidth > 900) setParam('thread', data[0].id); }, [data?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active?.unread) api.post(q(`/api/learn/messages/${active.id}/read`)).then(() => { setData((d) => d.map((t) => (t.id === active.id ? { ...t, unread: false } : t))); reloadSummary(); }).catch(() => {});
    end.current?.scrollIntoView({ block: 'end' });
  }, [active?.id, active?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault(); if (!reply.trim()) return; setBusy(true);
    try { const t = await api.post(q(`/api/learn/messages/${active.id}`), { text: reply }); setData((d) => d.map((x) => (x.id === t.id ? t : x))); setReply(''); } catch (x) { toast(x.message); } finally { setBusy(false); }
  };
  const start = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const t = await api.post(q('/api/learn/messages'), compose); await reload(); setParam('thread', t.id); setCompose(null); toast('Message sent'); } catch (x) { toast(x.message); } finally { setBusy(false); }
  };

  return (
    <>
      <section className="t-head"><div><h1>Messages</h1><p>Ask your instructors about lessons, labs or deadlines.</p></div>
        <button className="btn primary" disabled={!courses.length} title={courses.length ? '' : 'Enroll in a course to message its instructor'} onClick={() => setCompose({ courseId: courses[0]?.course.id || '', text: '' })}><Icon name="plus" small />New message</button></section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : !data.length ? (
        <div className="card"><div className="empty"><Icon name="mail" /><b>No messages yet</b><span>{courses.length ? 'Start a conversation with one of your instructors.' : 'Once you enroll in a course you can message its instructor here.'}</span></div></div>
      ) : (
        <section className={`card t-msgs${active ? ' has-active' : ''}`}>
          <div className="t-threads"><ul style={{ paddingTop: 8 }}>{data.map((t) => (
            <li key={t.id}><button className={`${t.id === activeId ? 'on' : ''}${t.unread ? ' unread' : ''}`} onClick={() => setParam('thread', t.id)}>
              <Avatar name={t.instructor} size={36} />
              <span className="tx"><span className="t-rh"><b>{t.instructor}</b><time>{ago(t.last.at)}</time></span><span className="pv">{t.last.from === 'student' ? 'You: ' : ''}{t.last.text}</span></span>
              {t.unread && <span className="dot" aria-label="Unread" />}
            </button></li>
          ))}</ul></div>
          <div className="t-thread">
            {active ? (<>
              <div className="t-th-head"><button className="icon-btn t-th-back" onClick={() => setParam('thread', '')} aria-label="Back"><Icon name="back" small /></button><Avatar name={active.instructor} size={38} /><div><b>{active.instructor}</b><span className="note">Instructor{active.course ? ` · ${active.course}` : ''}</span></div></div>
              <div className="t-bubbles">{active.messages.map((m, i) => <div key={i} className={`t-bubble ${m.from === 'student' ? 'instructor' : 'student'}`}><p>{m.text}</p><time>{when(m.at)}</time></div>)}<div ref={end} /></div>
              <form className="t-compose" onSubmit={send}><label className="sr" htmlFor="lReply">Reply</label>
                <textarea id="lReply" rows={2} placeholder={`Message ${active.instructor.split(' ')[0]}…`} value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }} />
                <button className="btn primary" disabled={busy || !reply.trim()}><Icon name="send" small />Send</button></form>
            </>) : <div className="empty"><Icon name="mail" /><b>Select a conversation</b></div>}
          </div>
        </section>
      )}
      <Dialog open={!!compose} onClose={() => setCompose(null)} title="New message" subtitle="Your message goes to the course’s instructor."
        footer={<><button className="btn" onClick={() => setCompose(null)}>Cancel</button><button className="btn primary" type="submit" form="lCompose" disabled={busy || !compose?.courseId || !compose?.text.trim()}><Icon name="send" small />Send</button></>}>
        {compose && (
          <form id="lCompose" className="form" onSubmit={start}>
            <div className="fg full"><label htmlFor="lCourse">Course</label><select id="lCourse" value={compose.courseId} onChange={(e) => setCompose((c) => ({ ...c, courseId: e.target.value }))}>{courses.map((e) => <option key={e.course.id} value={e.course.id}>{e.course.name} ({e.course.instructor.name})</option>)}</select></div>
            <div className="fg full"><label htmlFor="lText">Message</label><textarea id="lText" className="plain" value={compose.text} onChange={(e) => setCompose((c) => ({ ...c, text: e.target.value }))} /></div>
          </form>
        )}
      </Dialog>
    </>
  );
}
