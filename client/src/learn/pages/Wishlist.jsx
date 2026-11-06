import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Loading, ErrorNote } from '../shared.jsx';
import { useLearn, useLearnData, CourseCard } from '../lib.jsx';

export default function Wishlist() {
  const { q } = useLearn();
  const { data, loading, error, reload } = useLearnData('/api/learn/wishlist');
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  return (
    <>
      <section className="t-head"><div><h1>Wishlist</h1><p>Courses you’ve saved for later. Tap the heart on any course to add or remove it.</p></div></section>
      {data.length ? <div className="l-grid4">{data.map((c) => <CourseCard key={c.id} c={c} onChanged={reload} />)}</div>
        : <div className="card"><div className="empty"><Icon name="heart" /><b>Your wishlist is empty</b><span>Save courses you’re interested in and come back to them later.</span><Link className="btn sm primary" to={q('/learn/explore')}>Explore courses</Link></div></div>}
    </>
  );
}
