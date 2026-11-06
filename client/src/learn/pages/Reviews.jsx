import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Loading, ErrorNote, ago } from '../shared.jsx';
import { useLearn, useLearnData, Stars, ReviewForm } from '../lib.jsx';

export default function Reviews() {
  const { q } = useLearn();
  const { data, loading, error, reload } = useLearnData('/api/learn/reviews');
  const [editing, setEditing] = useState(null); // courseId
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  return (
    <>
      <section className="t-head"><div><h1>Reviews</h1><p>Rate the courses you take. Your feedback helps instructors and other learners.</p></div></section>
      {data.toReview.length > 0 && (
        <section className="card">
          <h2>Waiting for your review</h2>
          <ul className="t-list">{data.toReview.map((c) => (
            <li key={c.courseId} className="l-torev"><div><div className="t-rh"><b>{c.name}</b><span className="note">{c.progress}% complete</span></div>
              {editing === c.courseId ? <ReviewForm courseId={c.courseId} instructor={c.instructor} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /> : <button className="btn sm" onClick={() => setEditing(c.courseId)}><Icon name="star" small />Write a review</button>}</div></li>
          ))}</ul>
        </section>
      )}
      <section className="card">
        <h2>Your reviews</h2>
        {data.reviews.length ? <ul className="t-list">{data.reviews.map((v) => (
          <li key={v.id} className="t-review"><div>
            <div className="t-rh"><Link to={q('/learn/courses/' + v.courseId)}><b>{v.course}</b></Link><time>{ago(v.date)}</time></div>
            {editing === v.courseId ? <ReviewForm courseId={v.courseId} instructor={v.instructor} initial={v} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} /> : (<>
              <div className="l-rpair"><span className="note">Course</span><Stars value={v.rating} /></div><p>{v.comment || <i className="note">No comment</i>}</p>
              {v.instructorRating && <><div className="l-rpair"><span className="note">Instructor{v.instructor ? ` · ${v.instructor}` : ''}</span><Stars value={v.instructorRating} /></div>{v.instructorComment && <p>{v.instructorComment}</p>}</>}
              {v.reply && <div className="t-reply"><b>Reply from {v.instructor || 'your instructor'}</b><p>{v.reply}</p></div>}
              <button className="linkbtn" onClick={() => setEditing(v.courseId)}>Edit review</button>
            </>)}
          </div></li>
        ))}</ul> : <p className="note" style={{ margin: 0 }}>You haven’t reviewed any courses yet.</p>}
      </section>
    </>
  );
}
