import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { Confirm, DataTable, Dialog, EmptyState, Field, PageHead, StatusPill, sortRows } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useData, useToast } from '../../lib/store.jsx';
import { isURL } from '../../lib/constants.js';
import { useAdminData, useTable, Loading, ErrorNote, Stats, SearchBox, num, fmtDay } from '../lib.jsx';

const PARTS = [['description', 'Description'], ['topics', 'Topics'], ['objectives', 'Objectives'], ['lessons', 'Lessons'], ['outline', 'Outline']];
const has = (c, k) => (k === 'lessons' ? c.lessons > 0 : k === 'outline' ? !!c.outline : c[k]);
const score = (c) => Math.round((PARTS.filter(([k]) => has(c, k)).length / PARTS.length) * 100);
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function AddResource({ open, onClose, onDone }) {
  const { courses } = useData();
  const toast = useToast();
  const [f, setF] = useState({ title: '', courseId: '', url: '' });
  const [file, setFile] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const reset = () => { setF({ title: '', courseId: '', url: '' }); setFile(null); setErr({}); };
  const save = async () => {
    const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append('file', file);
    setBusy(true); setErr({});
    try { await api.post('/api/admin/resources', fd); toast('Resource added'); reset(); onDone(); onClose(); } catch (x) { setErr(x.fields || {}); if (!x.fields || !Object.keys(x.fields).length) toast(x.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} title="Add a resource" subtitle="Slides, lab guides, datasets or a link. Learners and the course's instructor can use it."
      footer={<><button className="btn" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}><Icon name="upload" small />{busy ? 'Uploading…' : 'Add resource'}</button></>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        <Field id="rs-title" label="Title" value={f.title} onChange={(v) => setF((s) => ({ ...s, title: v }))} error={err.title} placeholder="Defaults to the file name" />
        <Field id="rs-course" label="Course" type="select" options={[...courses].sort((a, b) => a.code.localeCompare(b.code)).map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))} value={f.courseId} onChange={(v) => setF((s) => ({ ...s, courseId: v }))} error={err.courseId} />
        <div className="fg"><label htmlFor="rs-file">File (up to 25 MB)</label><input id="rs-file" type="file" onChange={(e) => setFile(e.target.files[0] || null)} />{err.file && <span className="err">{err.file}</span>}</div>
        <Field id="rs-url" label="…or a link" value={f.url} onChange={(v) => setF((s) => ({ ...s, url: v }))} error={err.url} placeholder="https://" />
      </div>
    </Dialog>
  );
}

export default function Content() {
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, reload, setData } = useAdminData('/api/admin/content');
  const [tab, setTab] = useState('courses');
  const [q, setQ] = useState('');
  const [gap, setGap] = useState('');
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const t = useTable({ key: 'score', dir: 1 });
  const courses = data?.courses || [], resources = data?.resources || [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortRows(courses.filter((c) => (!s || [c.code, c.name, c.instructor, c.platform].join(' ').toLowerCase().includes(s)) && (!gap || !has(c, gap))), t.sort, (c, k) => (k === 'score' ? score(c) : c[k]));
  }, [courses, q, gap, t.sort]);
  const res = useMemo(() => { const s = q.trim().toLowerCase(); return resources.filter((r) => !s || [r.title, r.course, r.code, r.owner, r.filename].join(' ').toLowerCase().includes(s)); }, [resources, q]);
  const Tick = ({ on }) => (on ? <span className="am-yes" aria-label="Yes"><Icon name="check" small /></span> : <span className="am-no" aria-label="Missing">—</span>);
  const cols = [
    { key: 'name', label: 'Course', sortable: true, tdStyle: { minWidth: 260 }, render: (c) => <span className="two"><Link className="rowlink" to={'/courses/' + c.id}>{c.name}</Link><span>{c.code}{c.instructor && ` · ${c.instructor}`}</span></span> },
    { key: 'status', label: 'Status', sortable: true, render: (c) => <StatusPill status={c.status} /> },
    ...PARTS.map(([k, l]) => ({ key: k, label: l, render: (c) => (k === 'lessons' ? (c.lessons ? <span className="num">{c.lessons}{c.days ? <span className="note"> · {c.days} days</span> : null}</span> : <Tick on={false} />) : k === 'outline' && isURL(c.outline) ? <a href={c.outline} target="_blank" rel="noopener noreferrer"><Icon name="ext" small /></a> : <Tick on={has(c, k)} />) })),
    { key: 'resources', label: 'Resources', sortable: true, render: (c) => (c.resources ? <span className="num">{c.resources}</span> : <span className="am-no">—</span>) },
    { key: 'score', label: 'Complete', sortable: true, render: (c) => <span className={`am-score ${score(c) === 100 ? 'ok' : score(c) >= 60 ? 'mid' : 'low'}`}>{score(c)}%</span> }
  ];
  return (
    <>
      <PageHead eyebrow="Learning services" title="Content Management"
        actions={<>
          <button className="btn" onClick={() => nav('/courses?outlines=1')}><Icon name="file" small />Import Word outlines</button>
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="upload" small />Add resource</button>
        </>} />
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? !error && <Loading /> : (<>
        <Stats items={[['Courses', num(courses.length)], ['Fully built', num(courses.filter((c) => score(c) === 100).length), 'ok', 'Description, topics, objectives, lessons and outline'], ['With lessons', num(courses.filter((c) => c.lessons).length)], ['Missing topics', num(courses.filter((c) => !c.topics).length), 'warn'], ['Resources', num(resources.length)]]} />
        <div className="tabs" role="tablist" aria-label="Content">
          {[['courses', 'book', 'Course content', courses.length], ['resources', 'folder', 'Resource library', resources.length]].map(([k, ic, l, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}><Icon name={ic} small />{l}<span className="n">{n}</span></button>)}
        </div>
        <section className="toolbar" aria-label="Filters">
          <SearchBox id="ct-q" value={q} onChange={(v) => { setQ(v); t.setPage(1); }} placeholder={tab === 'courses' ? 'Search course, code or instructor…' : 'Search resources…'} />
          {tab === 'courses' && <select className="sel" aria-label="Missing" value={gap} onChange={(e) => { setGap(e.target.value); t.setPage(1); }}><option value="">All courses</option>{PARTS.map(([k, l]) => <option key={k} value={k}>Missing {l.toLowerCase()}</option>)}</select>}
        </section>
        {tab === 'courses' ? (
          <DataTable cols={cols} rows={rows} {...t.props} noun="courses" onRowClick={(c) => nav('/courses/' + c.id)} empty={<EmptyState title="No courses match" text="Try another filter." />} />
        ) : res.length ? (
          <section className="card tablecard"><div className="tscroll"><table>
            <thead><tr><th>Resource</th><th>Course</th><th>Added by</th><th>Added</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>{res.map((r) => (
              <tr key={r.id}>
                <td><span className="two"><b style={{ color: 'var(--ink)' }}><Icon name={r.kind === 'file' ? 'file' : 'link'} small /> {r.title}</b><span>{r.kind === 'file' ? `${r.filename} · ${size(r.size)}` : r.url}</span></span></td>
                <td>{r.course ? <span className="two"><span style={{ color: 'var(--ink)' }}>{r.course}</span><span>{r.code}</span></span> : <span className="note">General</span>}</td>
                <td>{r.owner}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDay(r.added)}</td>
                <td><div className="rowact">
                  {r.kind === 'file' ? <a href={`/api/admin/resources/${r.id}/file`} download title="Download" aria-label={'Download ' + r.title}><Icon name="download" small /></a> : <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open link" aria-label={'Open ' + r.title}><Icon name="ext" small /></a>}
                  <button onClick={() => setDel(r)} title="Delete" aria-label={'Delete ' + r.title}><Icon name="trash" small /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div></section>
        ) : <div className="card"><div className="empty"><Icon name="folder" /><b>{resources.length ? 'No resources match' : 'No resources yet'}</b><span>Upload slides, lab guides or links for a course. Instructors can add them too.</span><button className="btn sm primary" onClick={() => setAdding(true)}><Icon name="upload" small />Add resource</button></div></div>}
      </>)}
      <AddResource open={adding} onClose={() => setAdding(false)} onDone={reload} />
      <Confirm open={!!del} title="Delete this resource?" message={del && `“${del.title}” is removed for everyone, including the course's learners.`} confirmLabel="Delete resource" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del('/api/admin/resources/' + del.id); setData((d) => ({ ...d, resources: d.resources.filter((x) => x.id !== del.id), courses: d.courses.map((c) => (c.id === del.courseId ? { ...c, resources: c.resources - 1 } : c)) })); toast('Resource deleted'); } catch (x) { toast(x.message); } setDel(null); }} />
    </>
  );
}
