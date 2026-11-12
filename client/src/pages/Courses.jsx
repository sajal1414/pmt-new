import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { DataTable, Dialog, PageHead, StatusPill, EmptyState, Dash, sortRows, downloadText, toCSV } from '../components/ui.jsx';
import { InstructorForm, InstructorView } from './Instructors.jsx';
import BulkAssign from '../components/BulkAssign.jsx';
import OutlineDialog from '../components/OutlineDialog.jsx';
import { htmlToText } from '../lib/richtext.js';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import CoursePdfDialog from '../components/CoursePdfDialog.jsx';
import CatalogDialog from '../components/CatalogDialog.jsx';
import { GROUPS, groupOf, uniq } from '../lib/constants.js';

const EXPORT_KEYS = ['code', 'ibmCode', 'name', 'vendor', 'platform', 'portfolio', 'product', 'status', 'instructors', 'delivery', 'duration', 'hours', 'outlineStatus', 'outline', 'objectives', 'topics', 'skill', 'author', 'ipOwners', 'planned', 'release', 'retire', 'created'];

/** Instructor names open their details in place; "+N" shows the rest of the list. */
function InstructorCell({ list, onOpen }) {
  const { instructors } = useData();
  const [all, setAll] = useState(false);
  if (!list?.length) return <Dash />;
  const link = (n) => {
    const i = instructors.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase());
    return i ? <button type="button" key={n} className="ichip ilink" onClick={() => onOpen({ view: i })} title={`View ${n}'s details`}>{n}</button>
      : <button type="button" key={n} className="ichip ilink ext" onClick={() => onOpen({ view: { name: n } })} title={`View ${n}'s details (not in the instructor list yet)`}>{n}</button>;
  };
  return (
    <span className={all ? 'icell open' : 'icell'}>
      {(all ? list : list.slice(0, 1)).map(link)}
      {list.length > 1 && <button type="button" className="more" onClick={() => setAll((a) => !a)} aria-expanded={all} title={all ? 'Show fewer' : list.slice(1).join(', ')}>{all ? 'less' : `+${list.length - 1}`}</button>}
    </span>
  );
}

/** A course field matches a filter value (empty filter = any), ignoring case and spaces at the ends. */
const same = (v, want) => !want || String(v || '').trim().toLowerCase() === want.toLowerCase();

export default function Courses() {
  const nav = useNavigate();
  const { courses, ratings, reload } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '', vendor = params.get('vendor') || '', product = params.get('product') || '', platform = params.get('platform') || '', status = params.get('status') || '', instructor = params.get('instructor') || '', author = params.get('author') || '', ipOwner = params.get('ip') || '', customOnly = params.get('custom') === '1';
  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); setPage(1); };
  const [sort, setSort] = useState({ key: 'code', dir: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [outlines, setOutlines] = useState(false);
  // dashboard quick actions: /courses?new=1 opens the new-course form, ?outlines=1 the outline upload
  useEffect(() => {
    if (!params.get('new') && !params.get('outlines')) return;
    if (params.get('new')) { nav('/courses/new', { replace: true }); return; }
    setOutlines(true);
    const p = new URLSearchParams(params); p.delete('new'); p.delete('outlines'); setParams(p, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // each list only offers values that exist with the other two choices
  // spellings that differ only in case ("Datastage" / "DataStage") count as one value, shown as the most common spelling
  const opts = (k, keep) => {
    const seen = new Map();
    for (const c of courses.filter(keep)) { const v = (c[k] || '').trim(); if (!v) continue; const g = seen.get(v.toLowerCase()) || new Map(); g.set(v, (g.get(v) || 0) + 1); seen.set(v.toLowerCase(), g); }
    return [...seen.values()].map((g) => [...g].sort((a, b) => b[1] - a[1])[0][0]).sort((a, b) => a.localeCompare(b));
  };
  const vendors = useMemo(() => opts('vendor', (c) => same(c.platform, platform) && same(c.product, product)), [courses, platform, product]); // eslint-disable-line react-hooks/exhaustive-deps
  const platforms = useMemo(() => opts('platform', (c) => same(c.vendor, vendor) && same(c.product, product)), [courses, vendor, product]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = useMemo(() => opts('product', (c) => same(c.vendor, vendor) && same(c.platform, platform)), [courses, vendor, platform]); // eslint-disable-line react-hooks/exhaustive-deps
  const [opened, setOpened] = useState(() => new Set()); // main courses whose client versions are showing
  const flipOpen = (id) => setOpened((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = courses.filter((c) => (!s || [c.code, c.ibmCode, c.name, c.product, c.customFor, ...(c.instructors || []), ...(c.authors || []), ...(c.ipOwners || []), c.authorText].join(' ').toLowerCase().includes(s))
      && same(c.vendor, vendor) && same(c.platform, platform) && same(c.product, product)
      && (!status || (status.startsWith('grp:') ? groupOf(c.status).id === status.slice(4) : c.status === status))
      && (!instructor || (c.instructors || []).some((n) => n.trim().toLowerCase() === instructor.toLowerCase()))
      && (!ipOwner || (ipOwner === '-' ? !(c.ipOwners || []).length : (c.ipOwners || []).some((n) => n.trim().toLowerCase() === ipOwner.toLowerCase())))
      && (!author || (author === '-' ? !(c.authors || []).length && !c.authorText : (c.authors || []).some((n) => n.trim().toLowerCase() === author.toLowerCase())))
      && (!customOnly || c.customFor));
    const sorted = sortRows(list, sort, (c, k) => (k === 'rating' ? ratings.courses[c.id]?.avg : c[k]));
    // client versions sit under their main course; one whose main course isn't listed stays on its own
    const listed = new Set(sorted.map((c) => c.id)), under = new Map();
    for (const c of sorted) if (c.baseCourse && listed.has(c.baseCourse)) under.set(c.baseCourse, [...(under.get(c.baseCourse) || []), c]);
    return sorted.filter((c) => !(c.baseCourse && listed.has(c.baseCourse)))
      .flatMap((c) => [c, ...(under.has(c.id) && (opened.has(c.id) || s) ? under.get(c.id) : [])]);
  }, [courses, ratings, q, vendor, platform, product, status, instructor, author, ipOwner, customOnly, sort, opened]);
  // how many client versions each main course has (all of them, not just the ones the filters let through)
  const versionCount = useMemo(() => { const m = new Map(); for (const c of courses) if (c.baseCourse) m.set(c.baseCourse, (m.get(c.baseCourse) || 0) + 1); return m; }, [courses]);
  const isChild = (c) => c.baseCourse && courses.some((x) => x.id === c.baseCourse) && rows.some((x) => x.id === c.baseCourse);
  const active = q || vendor || platform || product || status || instructor || author || ipOwner || customOnly;
  const teachers = useMemo(() => uniq(courses.flatMap((c) => (c.instructors || []).map((n) => n.trim()))).sort((a, b) => a.localeCompare(b)), [courses]);
  const ipOwnerNames = useMemo(() => uniq(courses.flatMap((c) => c.ipOwners || [])).sort((a, b) => a.localeCompare(b)), [courses]);
  const authorNames = useMemo(() => uniq(courses.flatMap((c) => c.authors || [])).sort((a, b) => a.localeCompare(b)), [courses]);

  // bulk selection: kept across pages and filters until cleared
  const [sel, setSel] = useState(() => new Set());
  const [pdfFor, setPdfFor] = useState(null); // course ids for the PDF options window
  const [confirmDel, setConfirmDel] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [inst, setInst] = useState(null); // { view: instructor } | { edit: instructor } | { add: name }
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [assignIds, setAssignIds] = useState(null); // selected course ids, while choosing instructors to assign
  useEffect(() => { setSel((s0) => { const ids = new Set(courses.map((c) => c.id)), n = new Set([...s0].filter((id) => ids.has(id))); return n.size === s0.size ? s0 : n; }); }, [courses]);
  const toggle = (id) => setSel((s0) => { const n = new Set(s0); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((c) => sel.has(c.id)), someOn = rows.some((c) => sel.has(c.id));
  const toggleAll = () => setSel((s0) => { const n = new Set(s0); rows.forEach((c) => (allOn ? n.delete(c.id) : n.add(c.id))); return n; });
  const picked = courses.filter((c) => sel.has(c.id));
  const csvRow = (c) => ({ ...c, ipOwners: (c.ipOwners || []).join(', '), author: [...(c.authors || []), c.authorText].filter(Boolean).join(', '), topics: htmlToText(c.topics), objectives: htmlToText(c.objectives) });
  const csvOf = (list) => toCSV(list.map(csvRow), EXPORT_KEYS);
  const mustType = sel.size >= 10; // a big delete needs the word typed, a small one just a confirm
  const deleteSelected = async () => {
    setDeleting(true);
    try {
      const r = await api.post('/api/courses/bulk-delete', { ids: [...sel] });
      setConfirmDel(false); setTyped(''); setSel(new Set());
      await reload(['courses', 'activity', 'ratings']);
      toast(`Deleted ${r.deleted} course${r.deleted === 1 ? '' : 's'}. A backup was saved as ${r.backup}`);
    } catch (e) { toast(e.message); } finally { setDeleting(false); }
  };

  const cols = [
    { key: 'pick', tdStyle: { width: 36 }, label: <input type="checkbox" className="pick" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={toggleAll} aria-label={allOn ? 'Unselect all listed courses' : `Select all ${rows.length} listed courses`} title={allOn ? 'Unselect all' : `Select all ${rows.length} listed`} />,
      render: (c) => <input type="checkbox" className="pick" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={'Select ' + c.name} /> },
    { key: 'code', label: 'Code', sortable: true, render: (c) => <span className="code">{c.code}</span> },
    { key: 'name', label: 'Course name', sortable: true, tdStyle: { minWidth: 260 }, render: (c) => {
      const n = versionCount.get(c.id), open = opened.has(c.id) || !!q.trim();
      return <>{isChild(c) && <span className="cv-branch" aria-hidden="true">↳</span>}<Link className="rowlink" to={'/courses/' + c.id}>{c.name}</Link>{c.customFor && <span className="pill cv-pill" title={'Custom version for ' + c.customFor}>Custom · {c.customFor}</span>}{c.ibmCode && <span className="ibm">IBM: {c.ibmCode}</span>}
        {n > 0 && <button type="button" className="cv-toggle" aria-expanded={open} disabled={!!q.trim()} onClick={() => flipOpen(c.id)}><Icon name="right" small className="chev" />{n} client version{n === 1 ? '' : 's'}</button>}</>;
    } },
    { key: 'vendor', label: 'Vendor', sortable: true },
    { key: 'platform', label: 'Platform', sortable: true, render: (c) => (c.platform ? <span className="chip">{c.platform}</span> : <Dash />) },
    { key: 'product', label: 'Product', sortable: true },
    { key: 'status', label: 'Status', sortable: true, render: (c) => <StatusPill status={c.status} /> },
    { key: 'instructors', label: 'Instructor', render: (c) => <InstructorCell list={c.instructors} onOpen={setInst} /> },
    // who owns the content: instructors from their Author lists (and an imported author that isn't an instructor)
    // the instructors who developed the course and own its IP (from their IP Owned lists)
    { key: 'ipOwners', label: 'IP Owned by', render: (c) => (c.ipOwners?.length ? <span className="ca-cell">{c.ipOwners.map((n) => <span key={n} className="ca-tag ip-tag">{n}</span>)}</span> : <Dash />) },
    { key: 'authors', label: 'Author', render: (c) => (c.authors?.length || c.authorText ? <span className="ca-cell">{(c.authors || []).map((n) => <span key={n} className="ca-tag">{n}</span>)}{c.authorText && <span className="ca-tag ext" title="Not anyone in the instructor list">{c.authorText}</span>}</span> : <Dash />) },
    { key: 'rating', label: 'Rating', sortable: true, render: (c) => { const r = ratings.courses[c.id]; return r ? <span className="crev-cell" title={`${r.count} learner review${r.count === 1 ? '' : 's'}`}><span>★</span>{r.avg.toFixed(1)} <span className="note">({r.count})</span></span> : <Dash />; } },
    { key: 'created', label: 'Create date', sortable: true, tdClass: 'num', tdStyle: { whiteSpace: 'nowrap' } }
  ];

  return (
    <>
      <PageHead eyebrow="Course repository" title="Courses"
        summary={GROUPS.map((g) => (
          <button key={g.id} className={`pill ${g.tone} pill-filter`} aria-pressed={status === 'grp:' + g.id} title={status === 'grp:' + g.id ? 'Showing only these: click again to show all' : `Show only ${g.short.toLowerCase()} courses`}
            onClick={() => setParam('status', status === 'grp:' + g.id ? '' : 'grp:' + g.id)}><span className="d" />{g.short} · {courses.filter((c) => groupOf(c.status).id === g.id).length}</button>
        ))}
        actions={<>
          <button className="btn" onClick={() => { downloadText(toCSV(rows.map(csvRow), EXPORT_KEYS), `atlas-courses-${new Date().toISOString().slice(0, 10)}.csv`); toast(`Exported ${rows.length} courses`); }}><Icon name="download" small />Export CSV</button>
          <button className="btn" onClick={() => setCatalog(true)}><Icon name="book" small />Catalog</button>
          <button className="btn" onClick={() => nav('/courses/import')}><Icon name="upload" small />Bulk import</button>
          <button className="btn" onClick={() => setOutlines(true)}><Icon name="file" small />Import outlines</button>
          <button className="btn primary" onClick={() => nav('/courses/new')}><Icon name="plus" small />New course</button>
        </>} />
      <section className="toolbar" aria-label="Filters">
        <label className="field grow" htmlFor="f-q"><Icon name="search" small /><span className="sr">Search</span><input id="f-q" type="search" placeholder="Search code, name, product or instructor…" value={q} onChange={(e) => setParam('q', e.target.value)} autoComplete="off" /></label>
        <select className="sel" aria-label="IP owned by" value={ipOwner} onChange={(e) => setParam('ip', e.target.value)}><option value="">All IP owners</option><option value="-">No IP owner listed</option>{ipOwnerNames.map((n) => <option key={n}>{n}</option>)}</select>
        <select className="sel" aria-label="Author" value={author} onChange={(e) => setParam('author', e.target.value)}><option value="">All Authors</option><option value="-">No author yet</option>{authorNames.map((n) => <option key={n}>{n}</option>)}</select>
        <select className="sel" aria-label="Instructor" value={instructor} onChange={(e) => setParam('instructor', e.target.value)}><option value="">All Instructors</option>{teachers.map((n) => <option key={n}>{n}</option>)}</select>
        <select className="sel" aria-label="Vendor" value={vendor} onChange={(e) => setParam('vendor', e.target.value)}><option value="">All Vendors</option>{vendors.map((v) => <option key={v}>{v}</option>)}</select>
        <select className="sel" aria-label="Platform" value={platform} onChange={(e) => setParam('platform', e.target.value)}><option value="">All Platforms</option>{platforms.map((p) => <option key={p}>{p}</option>)}</select>
        <select className="sel" aria-label="Product" value={product} onChange={(e) => setParam('product', e.target.value)}><option value="">All Products</option>{products.map((p) => <option key={p}>{p}</option>)}</select>
        <button type="button" className={`btn sm${customOnly ? ' primary' : ''}`} aria-pressed={customOnly} onClick={() => setParam('custom', customOnly ? '' : '1')} title="Show only the custom versions made for clients"><Icon name="layers" small />Custom courses only</button>
        {active && <button className="btn sm" onClick={() => { setParams({}, { replace: true }); setPage(1); }}><Icon name="x" small />Clear filters</button>}
      </section>
      {sel.size > 0 && (
        <section className="bulkbar" aria-label="Selected courses">
          <b><span className="num">{sel.size}</span> course{sel.size === 1 ? '' : 's'} selected</b>
          {!allOn && rows.length > 0 && <button className="linkbtn" onClick={toggleAll}>Select all {rows.length} listed</button>}
          <span className="grow" />
          <button className="btn sm primary" onClick={() => setPdfFor(picked.map((c) => c.id))}><Icon name="download" small />{picked.length === 1 ? 'Download PDF' : `Download ${picked.length} PDFs (ZIP)`}</button>
          <button className="btn sm" onClick={() => setAssignIds(picked.map((c) => c.id))}><Icon name="people" small />Assign instructors</button>
          <button className="btn sm" onClick={() => setCatalog(true)}><Icon name="book" small />Catalog</button>
          <button className="btn sm" onClick={() => downloadText(csvOf(picked), `atlas-courses-selected-${new Date().toISOString().slice(0, 10)}.csv`)}><Icon name="table" small />Export CSV</button>
          <button className="btn sm danger-o" onClick={() => { setTyped(''); setConfirmDel(true); }}><Icon name="trash" small />Delete</button>
          <button className="btn sm" onClick={() => setSel(new Set())}><Icon name="x" small />Clear</button>
        </section>
      )}
      <DataTable cols={cols} rows={rows} noun="courses" rowClass={(c) => (isChild(c) ? 'cv-child' : '')} sort={sort} onSort={(k) => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}
        page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1); }}
        actions={(c) => <button type="button" onClick={() => setPdfFor([c.id])} aria-label={'Download PDF of ' + c.name} title="Download PDF"><Icon name="download" small /></button>}
        empty={<EmptyState title={courses.length ? 'No courses match these filters' : 'No courses yet'} text={active ? 'Try a different search, or clear the filters.' : 'Add one, or bring in a spreadsheet with Bulk import.'}
          action={active ? <button className="btn sm" onClick={() => setParams({}, { replace: true })}>Clear filters</button> : <button className="btn sm primary" onClick={() => nav('/courses/new')}><Icon name="plus" small />New course</button>} />} />
      <Dialog open={confirmDel} onClose={() => !deleting && setConfirmDel(false)} title={`Delete ${sel.size} course${sel.size === 1 ? '' : 's'}?`}
        subtitle="They're removed from the catalog, with their lessons, topics and outlines. A backup of all data is saved in server/data first, so this can be undone."
        footer={<><button className="btn" onClick={() => setConfirmDel(false)} disabled={deleting}>Cancel</button>
          <button className="btn danger" onClick={deleteSelected} disabled={deleting || (mustType && typed !== 'DELETE')}><Icon name="trash" small />{deleting ? 'Deleting…' : `Delete ${sel.size} course${sel.size === 1 ? '' : 's'}`}</button></>}>
        <ul className="del-list">{picked.slice(0, 6).map((c) => <li key={c.id}><span className="code">{c.code}</span> {c.name}</li>)}{picked.length > 6 && <li className="note">…and {picked.length - 6} more</li>}</ul>
        <p className="note" style={{ margin: 0 }}>Learner enrollments, reviews and payments for these courses are kept as history.</p>
        {mustType && <div className="fg"><label htmlFor="del-word">Type <b>DELETE</b> to confirm</label><input id="del-word" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></div>}
      </Dialog>
      <BulkAssign fixed="courses" ids={assignIds} onClose={() => setAssignIds(null)} onDone={() => setSel(new Set())} />
      <InstructorView x={inst?.view} onClose={() => setInst(null)} onEdit={() => setInst(inst.view.id ? { edit: inst.view } : { add: inst.view.name })} />
      <InstructorForm open={!!(inst?.edit || inst?.add)} record={inst?.edit} preset={inst?.add ? { name: inst.add } : undefined} onClose={() => setInst(null)} />
      <CatalogDialog open={catalog} onClose={() => setCatalog(false)} defaultScope={picked.length ? 'selected' : 'all'} scopes={[
        ['all', 'All courses', courses],
        ['available', 'Available & Published only', courses.filter((c) => groupOf(c.status).id === 'available')],
        active && ['filtered', `Courses matching the current filters (${[q && `“${q}”`, instructor, vendor, platform, product, status && (status.startsWith('grp:') ? GROUPS.find((g) => 'grp:' + g.id === status)?.short : status)].filter(Boolean).join(', ')})`, rows],
        picked.length > 0 && ['selected', 'Selected courses', picked]
      ].filter(Boolean)} />
      <OutlineDialog open={outlines} onClose={() => setOutlines(false)} />
      <CoursePdfDialog ids={pdfFor} onClose={() => setPdfFor(null)} />
    </>
  );
}
