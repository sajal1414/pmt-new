import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Loading, ErrorNote, shortDate } from '../shared.jsx';
import { useLearn, useLearnData } from '../lib.jsx';

export default function Certificates() {
  const { q } = useLearn();
  const { data, loading, error, reload } = useLearnData('/api/learn/certificates');
  const { data: pending } = useLearnData('/api/learn/certificates/pending');
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  return (
    <>
      <section className="t-head"><div><h1>My Certificates</h1><p>Earned by completing every lesson in a course and leaving a review. Download them as PDF.</p></div></section>
      {!!pending?.length && (
        <section className="card">
          <h2>Review to unlock</h2>
          <ul className="t-list">{pending.map((c) => (
            <li key={c.id} className="l-pend"><span className="l-pend-ic" aria-hidden="true"><Icon name="star" /></span><span className="tx"><b>{c.course}</b><span className="note">{c.code} · Completed {shortDate(c.completed)}</span></span><Link className="btn sm primary" to={q('/learn/courses/' + c.courseId, { tab: 'reviews' })}>Write review</Link></li>
          ))}</ul>
        </section>
      )}
      {data.length ? (
        <section className="l-certs">{data.map((c) => (
          <article key={c.id} className="card l-cert">
            <div className="l-cert-art" aria-hidden="true"><Icon name="award" /><span>CERTIFICATE</span></div>
            <b className="l-cname">{c.course}</b>
            <span className="note">{c.code}{c.hours ? ` · ${c.hours} hours` : ''} · Completed {shortDate(c.completed)}</span>
            <span className="note">Instructor: {c.instructor || '—'} · <span className="code">{c.number}</span></span>
            <div className="actions"><a className="btn sm primary" href={q(`/api/learn/certificates/${c.id}/pdf`)} download><Icon name="download" small />Download PDF</a><Link className="btn sm" to={q('/learn/courses/' + c.courseId)}>View course</Link></div>
          </article>
        ))}</section>
      ) : !pending?.length && <div className="card"><div className="empty"><Icon name="award" /><b>No certificates yet</b><span>Finish all the lessons in a course to earn its certificate.</span><Link className="btn sm primary" to={q('/learn/my-learning')}>Go to My Learning</Link></div></div>}
    </>
  );
}
