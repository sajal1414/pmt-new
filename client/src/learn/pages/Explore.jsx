import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Loading, ErrorNote, platformIconOf } from '../shared.jsx';
import { useLearn, useLearnData, CourseCard } from '../lib.jsx';

const SORTS = [['popular', 'Most popular'], ['soonest', 'Starting soonest'], ['rating', 'Highest rated'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name A–Z']];
const PAGE = 24;

export default function Explore() {
  const { data, loading, error, reload } = useLearnData('/api/learn/catalog');
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const { q } = useLearn();
  const nav = useNavigate();
  const text = params.get('q') || '', category = params.get('category') || '', level = params.get('level') || '', price = params.get('price') || '', when = params.get('when') || '', kind = params.get('kind') || '', sort = params.get('sort') || 'popular';
  const set = (k, v) => { setShown(PAGE); setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); n.delete('view'); return n; }, { replace: true }); };
  const list = useMemo(() => {
    const s = text.trim().toLowerCase();
    const out = (data?.courses || []).filter((c) => (!s || `${c.name} ${c.code} ${c.platform} ${c.product} ${c.instructor.name} ${c.customFor} ${c.description}`.toLowerCase().includes(s))
      && (!category || c.platform === category) && (!level || c.level === level) && (!price || (price === 'free' ? !c.price : c.price > 0)) && (!when || !!c.nextBatch)
      && (!kind || (kind === 'standard' ? !c.customFor : kind === 'custom' ? !!c.customFor : c.customFor === kind.slice(7))));
    const by = { popular: (a, b) => b.learners - a.learners, rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0), 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name),
      soonest: (a, b) => (a.nextBatch?.startUtc || '9999').localeCompare(b.nextBatch?.startUtc || '9999') || b.learners - a.learners }[sort];
    // client versions come under their main course's card, unless someone is looking for them (custom filter or a search)
    const ids = new Set(out.map((c) => c.id));
    return out.filter((c) => kind || s || !(c.baseCourse && ids.has(c.baseCourse.id))).sort(by);
  }, [data, text, category, level, price, when, kind, sort]);
  const versionsOf = useMemo(() => {
    const m = new Map();
    for (const c of data?.courses || []) if (c.baseCourse) m.set(c.baseCourse.id, [...(m.get(c.baseCourse.id) || []), c]);
    return m;
  }, [data]);
  // client versions of courses: offered as a filter once there are any
  const clients = useMemo(() => [...new Set((data?.courses || []).map((c) => c.customFor).filter(Boolean))].sort(), [data]);
  const mainCount = (data?.courses || []).filter((c) => !c.baseCourse || !versionsOf.has(c.baseCourse.id) || !data.courses.some((x) => x.id === c.baseCourse.id)).length;
  if (error) return <ErrorNote error={error} retry={reload} />;
  if (!data) return loading && <Loading />;
  return (
    <>
      <section className="t-head">
        <div><h1>Explore Courses</h1><p>{mainCount} courses across {data.categories.length} categories.</p></div>
        <button className="btn primary" onClick={() => nav(q('/learn/advisor', { act: 'choose' }))}><Icon name="target" small />Get recommendations</button>
      </section>
      <section className="l-catrow" aria-label="Categories">
        <button className={`l-pillcat${!category ? ' on' : ''}`} onClick={() => set('category', '')}>All <span>{mainCount}</span></button>
        {data.categories.map((c) => <button key={c.name} className={`l-pillcat${category === c.name ? ' on' : ''}`} onClick={() => set('category', category === c.name ? '' : c.name)}><Icon name={platformIconOf(c.name)} small />{c.name} <span>{c.count}</span></button>)}
      </section>
      <section className="toolbar">
        <label className="field grow"><Icon name="search" small /><span className="sr">Search</span><input type="search" placeholder="Search courses, instructors, topics…" value={text} onChange={(e) => set('q', e.target.value)} /></label>
        <select className="sel" value={level} onChange={(e) => set('level', e.target.value)} aria-label="Level"><option value="">All levels</option>{['Beginner', 'Intermediate', 'Advanced'].map((l) => <option key={l}>{l}</option>)}</select>
        <select className="sel" value={price} onChange={(e) => set('price', e.target.value)} aria-label="Price"><option value="">Any price</option><option value="free">Free</option><option value="paid">Paid</option></select>
        <select className="sel" value={when} onChange={(e) => set('when', e.target.value)} aria-label="Schedule"><option value="">Any schedule</option><option value="scheduled">Upcoming batch</option></select>
        {clients.length > 0 && <select className="sel" value={kind} onChange={(e) => set('kind', e.target.value)} aria-label="Course type"><option value="">All courses</option><option value="standard">Standard courses</option><option value="custom">Custom versions</option>
          <optgroup label="Custom for">{clients.map((n) => <option key={n} value={'client:' + n}>{n}</option>)}</optgroup></select>}
        <select className="sel" value={sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </section>
      <p className="note" style={{ margin: 0 }}>{list.length} course{list.length === 1 ? '' : 's'}{category ? ` in ${category}` : ''}{text ? ` matching “${text}”` : ''}</p>
      {list.length ? <div className="l-grid4">{list.slice(0, shown).map((c) => <CourseCard key={c.id} c={c} onChanged={reload} versions={kind || text.trim() ? [] : versionsOf.get(c.id)} />)}</div>
        : <div className="card"><div className="empty"><Icon name="search" /><b>No courses match</b><span>Try another search or category.</span><button className="btn sm" onClick={() => setParams({}, { replace: true })}>Clear filters</button></div></div>}
      {list.length > shown && <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setShown((s) => s + PAGE)}>Show more ({list.length - shown} left)</button>}
    </>
  );
}
