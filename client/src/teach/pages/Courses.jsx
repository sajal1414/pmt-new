import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import OutlineDialog from '../../components/OutlineDialog.jsx';
import { useTeach, useTeachData, Loading, ErrorNote, num } from '../lib.jsx';
import CourseTable from '../CourseTable.jsx';

export default function Courses() {
  const { data, loading, error, reload } = useTeachData('/api/teach/courses');
  const { q } = useTeach();
  const nav = useNavigate();
  const [uploading, setUploading] = useState(false);
  const mine = useMemo(() => new Set((data || []).map((c) => c.id)), [data]);
  const totals = useMemo(() => (data || []).reduce((a, c) => ({ students: a.students + c.students, published: a.published + (c.tab === 'published' ? 1 : 0) }), { students: 0, published: 0 }), [data]);
  return (
    <>
      <section className="t-head">
        <div><h1>My Courses</h1><p>{data ? `${data.length} courses · ${totals.published} published · ${num(totals.students)} enrollments` : 'Your courses and their learners.'}</p></div>
        <div className="actions">
          <button className="btn" onClick={() => setUploading(true)}><Icon name="upload" small />Upload outlines</button>
          <button className="btn primary" onClick={() => nav(q('/teach/courses/new'))}><Icon name="plus" small />Create New Course</button>
        </div>
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : <section className="card tc-card"><CourseTable full courses={data} onChanged={reload} /></section>}
      <OutlineDialog open={uploading} courseIds={mine} onClose={() => setUploading(false)} onDone={reload} />
    </>
  );
}
