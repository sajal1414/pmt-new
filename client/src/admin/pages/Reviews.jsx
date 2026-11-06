import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Confirm, PageHead, downloadText, toCSV } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useData, useToast } from '../../lib/store.jsx';
import { HBars } from '../../teach/charts.jsx';
import { useAdminData, Loading, ErrorNote, Stats, Stars, Avatar, SearchBox, num, fmtDay } from '../lib.jsx';

const PAGE = 15;

export default function Reviews() {
  const toast = useToast();
  const { reload: reloadAll } = useData();
  const { data, error, reload, setData } = useAdminData('/api/admin/reviews');
  const [q, setQ] = useState('');
  const [stars, setStars] = useState('');
  const [course, setCourse] = useState('');
  const [show, setShow] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState(null); // { id, text }
  const [del, setDel] = useState(null);
  const all = data || [];
  const courses = useMemo(() => [...new Map(all.map((v) => [v.courseId, `${v.code} · ${v.course}`])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((v) => (!s || [v.student, v.email, v.course, v.code, v.comment, v.instructorComment, v.instructor].join(' ').toLowerCase().includes(s)) && (!stars || v.rating === +stars) && (!course || v.courseId === course)
      && (show === 'all' || (show === 'noreply' ? !v.reply : show === 'low' ? v.rating <= 2 : show === 'real' ? !v.sample : true)));
  }, [all, q, stars, course, show]);
  const avg = (k) => { const l = all.filter((v) => v[k]); return l.length ? (l.reduce((a, v) => a + v[k], 0) / l.length).toFixed(1) : '—'; };
  const refresh = () => reloadAll(['ratings']);
  const reply = async (v) => {
    try { const r = await api.post(`/api/admin/reviews/${v.id}/reply`, { reply: editing.text }); setData((d) => d.map((x) => (x.id === v.id ? { ...x, reply: r.reply, approved: true } : x))); setEditing(null); toast(r.reply ? 'Reply posted' : 'Reply removed'); } catch (x) { toast(x.message); }
  };
  return (
    <>
      <PageHead eyebrow="Quality" title="Reviews & Ratings"
        actions={<button className="btn" disabled={!list.length} onClick={() => downloadText(toCSV(list, ['date', 'student', 'email', 'code', 'course', 'rating', 'comment', 'instructor', 'instructorRating', 'instructorComment', 'reply']), 'atlas-reviews.csv')}><Icon name="download" small />Export CSV</button>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <section className="am-two">
          <div className="card am-rsum">
            <div className="am-avg"><b className="num">{avg('rating')}</b><Stars value={+avg('rating') || 0} size={18} /><span className="note">Course rating · {num(all.length)} reviews</span></div>
            <div className="am-avg"><b className="num">{avg('instructorRating')}</b><Stars value={+avg('instructorRating') || 0} size={18} /><span className="note">Instructor rating · {num(all.filter((v) => v.instructorRating).length)} answers</span></div>
          </div>
          <div className="card"><h2 style={{ margin: 0, fontSize: 15 }}>Course stars</h2><HBars rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} star`, value: all.filter((v) => v.rating === s).length }))} total={all.length} color="#E9A23B" /></div>
        </section>
        <Stats items={[['Waiting for a reply', num(all.filter((v) => !v.reply).length), 'warn'], ['1–2 star reviews', num(all.filter((v) => v.rating <= 2).length), all.some((v) => v.rating <= 2) ? 'red' : ''], ['From real learners', num(all.filter((v) => !v.sample).length), 'acc'], ['Courses reviewed', num(courses.length)]]} />
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="rv-q" value={q} onChange={(v) => { setQ(v); setShown(PAGE); }} placeholder="Search learner, course or comment…" />
          <select className="sel" aria-label="Course" value={course} onChange={(e) => { setCourse(e.target.value); setShown(PAGE); }}><option value="">All courses</option>{courses.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select className="sel" aria-label="Stars" value={stars} onChange={(e) => { setStars(e.target.value); setShown(PAGE); }}><option value="">All stars</option>{[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} star{s > 1 ? 's' : ''}</option>)}</select>
          <div className="seg-row" role="group" aria-label="Show">{[['all', 'All'], ['noreply', 'Needs reply'], ['low', 'Low ratings'], ['real', 'Real learners']].map(([k, l]) => <button key={k} type="button" className="seg" aria-pressed={show === k} onClick={() => { setShow(k); setShown(PAGE); }}>{l}</button>)}</div>
        </section>
        <section className="am-reviews">
          {list.slice(0, shown).map((v) => (
            <article key={v.id} className="card am-rv">
              <div className="am-rv-h"><Avatar name={v.student} /><div><b>{v.student}</b>{v.sample && <span className="pill gone" style={{ height: 18, fontSize: 10.5, marginLeft: 6 }}>Sample</span>}<span className="note">{v.email}</span></div><time className="note">{fmtDay(v.date)}</time></div>
              <Link className="am-rv-c" to={'/courses/' + v.courseId}><span className="code">{v.code}</span> {v.course}</Link>
              <div className="am-rv-s"><span><span className="note">Course</span><Stars value={v.rating} /></span>{v.instructorRating && <span><span className="note">Instructor · {v.instructor}</span><Stars value={v.instructorRating} /></span>}</div>
              {v.comment ? <p>{v.comment}</p> : <p className="note"><i>No written comment.</i></p>}
              {v.instructorComment && <p><span className="note">On the instructor:</span> {v.instructorComment}</p>}
              {editing?.id === v.id ? (
                <div className="t-replybox">
                  <label className="sr" htmlFor={'rp' + v.id}>Reply</label>
                  <textarea id={'rp' + v.id} rows={3} autoFocus value={editing.text} onChange={(e) => setEditing({ id: v.id, text: e.target.value })} placeholder="Thank the learner, or answer their concern…" />
                  <div className="actions"><button className="btn sm" onClick={() => setEditing(null)}>Cancel</button><button className="btn sm primary" onClick={() => reply(v)}><Icon name="send" small />Post reply</button></div>
                </div>
              ) : (<>
                {v.reply && <div className="t-reply"><b>Reply</b><p>{v.reply}</p></div>}
                <div className="am-rv-a">
                  <button className="btn sm" onClick={() => setEditing({ id: v.id, text: v.reply })}><Icon name="msg" small />{v.reply ? 'Edit reply' : 'Reply'}</button>
                  <button className="btn sm ad-no" onClick={() => setDel(v)}><Icon name="trash" small />Remove</button>
                </div>
              </>)}
            </article>
          ))}
          {!list.length && <div className="card"><div className="empty"><Icon name="star" /><b>No reviews match</b><span>Try another filter.</span></div></div>}
        </section>
        {list.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown((n) => n + PAGE * 2)}>Show more ({list.length - shown} left)</button>}
      </>)}
      <Confirm open={!!del} title="Remove this review?" message={del && `${del.student}'s ${del.rating}-star review of ${del.course} is deleted and stops counting towards ratings everywhere.`} confirmLabel="Remove review" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del('/api/admin/reviews/' + del.id); setData((d) => d.filter((x) => x.id !== del.id)); refresh(); toast('Review removed'); } catch (x) { toast(x.message); } setDel(null); }} />
    </>
  );
}
