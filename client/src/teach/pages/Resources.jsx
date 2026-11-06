import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Confirm, Dialog, Field } from '../../components/ui.jsx';
import { api } from '../../api.js';
import { useToast } from '../../lib/store.jsx';
import { useTeach, useTeachData, Loading, ErrorNote, shortDate } from '../lib.jsx';

const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const kindOf = (r) => (r.kind === 'link' ? 'link' : (r.filename.split('.').pop() || 'file').toLowerCase());
const blank = { kind: 'file', title: '', courseId: '', url: '', file: null };

export default function Resources() {
  const { q } = useTeach();
  const toast = useToast();
  const { data, loading, error, reload } = useTeachData('/api/teach/resources');
  const { data: courses } = useTeachData('/api/teach/courses');
  const [text, setText] = useState('');
  const [course, setCourse] = useState('');
  const [form, setForm] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const list = useMemo(() => { const s = text.trim().toLowerCase(); return (data || []).filter((r) => (!course || r.courseId === course) && (!s || `${r.title} ${r.filename} ${r.course}`.toLowerCase().includes(s))); }, [data, text, course]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try {
      if (form.kind === 'file') {
        const fd = new FormData();
        if (form.file) fd.append('file', form.file);
        fd.append('title', form.title); fd.append('courseId', form.courseId);
        await api.post(q('/api/teach/resources'), fd);
      } else await api.post(q('/api/teach/resources'), { title: form.title, courseId: form.courseId, url: form.url });
      toast('Resource added'); setForm(null); reload();
    } catch (x) { setErr(x.fields || {}); if (!x.fields) toast(x.message); } finally { setBusy(false); }
  };
  return (
    <>
      <section className="t-head">
        <div><h1>Resources</h1><p>Slides, lab guides, handouts and useful links for your courses.</p></div>
        <button className="btn primary" onClick={() => { setForm(blank); setErr({}); }}><Icon name="plus" small />Add resource</button>
      </section>
      {error && <ErrorNote error={error} retry={reload} />}
      {!data ? loading && <Loading /> : (<>
        <section className="toolbar">
          <label className="field grow"><Icon name="search" small /><span className="sr">Search</span><input type="search" placeholder="Search resources…" value={text} onChange={(e) => setText(e.target.value)} /></label>
          <select className="sel" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course"><option value="">All courses</option>{(courses || []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
        </section>
        {list.length ? (
          <section className="t-res">{list.map((r) => (
            <article key={r.id} className="card t-rescard">
              <span className={`t-ext ${r.kind === 'link' ? 'link' : ''}`}>{r.kind === 'link' ? <Icon name="link" /> : kindOf(r).slice(0, 4).toUpperCase()}</span>
              <div className="t-resb"><b>{r.title}</b><span className="note">{r.kind === 'link' ? r.url.replace(/^https?:\/\//, '') : `${r.filename} · ${size(r.size)}`}</span><span className="note">{r.course ? `${r.code} · ` : 'All courses · '}added {shortDate(r.added)}</span></div>
              <div className="rowact">
                {r.kind === 'link' ? <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + r.title} title="Open link"><Icon name="ext" small /></a>
                  : <a href={q(`/api/teach/resources/${r.id}/file`)} download aria-label={'Download ' + r.title} title="Download"><Icon name="download" small /></a>}
                <button className="del" onClick={() => setDel(r)} aria-label={'Delete ' + r.title} title="Delete"><Icon name="trash" small /></button>
              </div>
            </article>
          ))}</section>
        ) : <div className="card"><div className="empty"><Icon name="folder" /><b>{data.length ? 'No resources match' : 'No resources yet'}</b><span>{data.length ? 'Try another search or course.' : 'Add slides, lab guides or useful links for your learners.'}</span>{!data.length && <button className="btn sm primary" onClick={() => setForm(blank)}><Icon name="plus" small />Add resource</button>}</div></div>}
      </>)}
      <Dialog open={!!form} onClose={() => setForm(null)} title="Add resource" subtitle="Upload a file (up to 25 MB) or share a link."
        footer={<><button className="btn" onClick={() => setForm(null)}>Cancel</button><button className="btn primary" type="submit" form="tRes" disabled={busy}><Icon name="upload" small />{busy ? 'Saving…' : 'Add resource'}</button></>}>
        {form && (
          <form id="tRes" className="form" noValidate onSubmit={submit}>
            <div className="fg full"><span className="lbl" style={{ fontSize: 13, fontWeight: 600 }}>Type</span>
              <div className="seg-row">{[['file', 'upload', 'Upload a file'], ['link', 'link', 'Add a link']].map(([k, ic, l]) => <button key={k} type="button" className="seg" aria-pressed={form.kind === k} onClick={() => set('kind')(k)}><Icon name={ic} small /> {l}</button>)}</div></div>
            {form.kind === 'file' ? (
              <div className="fg full"><label htmlFor="tResFile">File</label>
                <input id="tResFile" type="file" onChange={(e) => { const f = e.target.files[0]; setForm((s) => ({ ...s, file: f, title: s.title || (f ? f.name.replace(/\.[^.]+$/, '') : '') })); }} />
                <span className="err">{err.file || ''}</span></div>
            ) : <Field id="tResUrl" className="full" label="Link" value={form.url} onChange={set('url')} error={err.url || err.file} placeholder="https://…" />}
            <Field id="tResTitle" className="full" label="Title" required value={form.title} onChange={set('title')} error={err.title} />
            <div className="fg full"><label htmlFor="tResCourse">Course (optional)</label>
              <select id="tResCourse" value={form.courseId} onChange={(e) => set('courseId')(e.target.value)}><option value="">All my courses</option>{(courses || []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
          </form>
        )}
      </Dialog>
      <Confirm open={!!del} title="Delete resource?" message={del ? `“${del.title}” will be removed${del.kind === 'file' ? ' and the file deleted' : ''}.` : ''} confirmLabel="Delete" onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.del(q(`/api/teach/resources/${del.id}`)); toast('Deleted ' + del.title); reload(); } catch (x) { toast(x.message); } setDel(null); }} />
    </>
  );
}
