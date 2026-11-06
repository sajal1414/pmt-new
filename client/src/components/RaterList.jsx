import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Feedback } from './ui.jsx';

const PAGE = 10;

/** Who rated a course or an instructor, newest first: `by` is { course: id } or { instructor: id }. */
export default function RaterList({ by, onOpenCourse }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [find, setFind] = useState('');
  const [stars, setStars] = useState('');
  const [shown, setShown] = useState(PAGE);
  const key = by.instructor ? 'instructor=' + by.instructor : 'course=' + by.course;
  useEffect(() => {
    let live = true; setList(null); setError('');
    api.get('/api/ratings/reviews?' + key).then((r) => live && setList(r), (e) => live && setError(e.message));
    return () => { live = false; };
  }, [key]);
  if (error) return <p className="note">{error}</p>;
  if (!list) return <p className="note">Loading ratings…</p>;
  if (!list.length) return <p className="note" style={{ margin: 0 }}>No learner has rated {by.instructor ? 'this instructor' : 'this course'} yet.</p>;
  const forInst = !!by.instructor;
  // instructor view: the instructor's own stars when the learner gave them, otherwise the course stars
  const score = (v) => (forInst ? v.instructorRating || v.rating : v.rating);
  const s = find.trim().toLowerCase();
  const rows = list.filter((v) => (!s || [v.student, v.email, v.course, v.code].join(' ').toLowerCase().includes(s)) && (!stars || score(v) === +stars));
  return (
    <div className="rl">
      <div className="rl-bar">
        <input className="rl-find" type="search" placeholder="Search learner or course" value={find} onChange={(e) => { setFind(e.target.value); setShown(PAGE); }} aria-label="Search ratings" />
        <select className="sel" value={stars} onChange={(e) => { setStars(e.target.value); setShown(PAGE); }} aria-label="Stars"><option value="">All stars</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}</select>
        <span className="note">{rows.length} of {list.length}</span>
      </div>
      <ul className="rl-list">{rows.slice(0, shown).map((v) => (
        <li key={v.id}>
          <div className="rl-who"><b>{v.student}</b>{v.sample && <span className="pill gone rl-tag">Sample</span>}<span className="note">{v.email}</span><time className="note">{v.date}</time></div>
          {forInst && <div className="rl-course"><span className="code">{v.code}</span> {onOpenCourse ? <Link to={'/courses/' + v.courseId} onClick={onOpenCourse}>{v.course}</Link> : v.course}</div>}
          <div className="rl-scores">
            <span><span className="note">Instructor</span>{v.instructorRating ? <Feedback rating={v.instructorRating} /> : <span className="note">not rated</span>}</span>
            <span><span className="note">Course</span><Feedback rating={v.rating} /></span>
          </div>
          {v.instructorComment && <p><span className="note">On the instructor:</span> {v.instructorComment}</p>}
          {v.comment && <p><span className="note">On the course:</span> {v.comment}</p>}
        </li>
      ))}</ul>
      {rows.length > shown && <button type="button" className="btn sm" onClick={() => setShown((n) => n + PAGE * 2)}>Show more ({rows.length - shown} left)</button>}
    </div>
  );
}
