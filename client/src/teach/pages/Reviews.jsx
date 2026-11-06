import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useTeach, useTeachData, Avatar, Stars, Loading, ErrorNote, ago, num } from '../lib.jsx';
import { HBars } from '../charts.jsx';

const PAGE = 20;

export default function Reviews() {
  const { q } = useTeach();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useTeachData('/api/teach/reviews');
  const [course, setCourse] = useState('');
  const [stars, setStars] = useState('');
  const [replied, setReplied] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState(null); // { id, text }
  const all = data || [];
  const courses = useMemo(() => [...new Map(all.map((v) => [v.courseId, v.course])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const list = all.filter((v) => (!course || v.courseId === course) && (!stars || v.rating === +stars) && (replied === 'all' || (replied === 'yes' ? !!v.reply : !v.reply)));
  const avg = all.length ? all.reduce((a, v) => a + v.rating, 0) / all.length : 0;
  const save = async (v) => {
    try { const out = await api.post(q(`/api/teach/reviews/${v.id}/reply`), { reply: editing.text }); setData((d) => d.map((x) => (x.id === v.id ? out : x))); setEditing(null); toast(out.reply ? 'Reply posted' : 'Reply removed'); }
    catch (x) { toast(x.message); }
  };
  return (
    <>
      <section className="t-head"><div><h1>Reviews</h1><p>What learners say about your courses. Reply to thank them or answer concerns.</p></div></section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (<>
        <section className="card t-rsum">
          <div className="t-avg big"><b>{avg ? avg.toFixed(1) : '—'}</b><Stars value={avg} size={20} /><span className="note">{num(all.length)} reviews · {num(all.filter((v) => v.reply).length)} replied</span></div>
          <HBars rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} star`, value: all.filter((v) => v.rating === s).length }))} total={all.length} />
        </section>
        <section className="toolbar">
          <select className="sel" value={course} onChange={(e) => { setCourse(e.target.value); setShown(PAGE); }} aria-label="Course"><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select className="sel" value={stars} onChange={(e) => { setStars(e.target.value); setShown(PAGE); }} aria-label="Rating"><option value="">All ratings</option>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} star{s > 1 ? 's' : ''}</option>)}</select>
          <select className="sel" value={replied} onChange={(e) => { setReplied(e.target.value); setShown(PAGE); }} aria-label="Reply status"><option value="all">Replied or not</option><option value="no">Needs a reply</option><option value="yes">Replied</option></select>
          <span className="note">{list.length} review{list.length === 1 ? '' : 's'}</span>
        </section>
        <section className="t-reviews">
          {list.slice(0, shown).map((v) => (
            <article key={v.id} className="card t-rcard">
              <div className="t-rtop"><Avatar name={v.student} /><div><b>{v.student}</b><span className="note">{v.course}</span></div><time className="note">{ago(v.date)}</time></div>
              <div className="l-rpair"><span className="note">Course</span><Stars value={v.rating} size={16} /></div>
              <p>{v.comment || <i className="note">No written comment.</i>}</p>
              {v.instructorRating && <><div className="l-rpair"><span className="note">You</span><Stars value={v.instructorRating} size={16} /></div>{v.instructorComment && <p>{v.instructorComment}</p>}</>}
              {editing?.id === v.id ? (
                <div className="t-replybox">
                  <label className="sr" htmlFor={'rp' + v.id}>Your reply</label>
                  <textarea id={'rp' + v.id} rows={3} value={editing.text} onChange={(e) => setEditing({ id: v.id, text: e.target.value })} autoFocus placeholder="Thank them, or answer their concern…" />
                  <div className="actions"><button className="btn sm" onClick={() => setEditing(null)}>Cancel</button><button className="btn sm primary" onClick={() => save(v)}><Icon name="send" small />{v.reply ? 'Update reply' : 'Post reply'}</button></div>
                </div>
              ) : v.reply ? (
                <div className="t-reply"><b>Your reply</b><p>{v.reply}</p><button className="linkbtn" onClick={() => setEditing({ id: v.id, text: v.reply })}>Edit reply</button></div>
              ) : <button className="btn sm" onClick={() => setEditing({ id: v.id, text: '' })}><Icon name="msg" small />Reply</button>}
            </article>
          ))}
          {!list.length && <div className="empty"><Icon name="star" /><b>No reviews match</b><span>Try another filter.</span></div>}
        </section>
        {list.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown((s) => s + PAGE)}>Show more ({list.length - shown} left)</button>}
      </>)}
    </>
  );
}
