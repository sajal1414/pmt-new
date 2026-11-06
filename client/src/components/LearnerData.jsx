import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { Confirm, Dialog } from './ui.jsx';
import { api } from '../api.js';
import { useToast } from '../lib/store.jsx';

/** Admin: see what learner data is sample vs real, remove the samples, import real enrollments. */
export default function LearnerData({ open, onClose }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const load = () => api.get('/api/learning/status').then(setStatus).catch((e) => toast(e.message));
  useEffect(() => { if (open) { load(); setFile(null); setResult(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const importFile = async () => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('replaceSample', String(replace && !!status?.sample));
      const r = await api.post('/api/learning/import', fd);
      setResult(r); toast(`Imported ${r.added} enrollments${r.updated ? `, updated ${r.updated}` : ''}`); load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Dialog open={open} onClose={onClose} wide title="Learner data" subtitle="Students, enrollments and reviews behind the instructor dashboards."
        footer={<button className="btn" onClick={onClose}>Close</button>}>
        {status && (
          <div className="box">
            <h4><Icon name="people" small />Current data</h4>
            <p style={{ margin: 0 }}>{status.students} students · {status.enrollments} enrollments · {status.reviews} reviews
              {status.sample ? <> — <b style={{ color: 'var(--warn-ink)' }}>{status.sampleEnrollments} enrollments are sample records</b> created so the instructor area isn’t empty.</> : ' — all real.'}</p>
            {status.sample && <div><button className="btn sm danger" onClick={() => setConfirm(true)}><Icon name="trash" small />Remove sample learner data</button></div>}
          </div>
        )}
        <div className="box">
          <h4><Icon name="upload" small />Import real enrollments</h4>
          <p className="note" style={{ margin: 0 }}>Excel or CSV with columns: <b>Student Name, Student Email, Course Code, Enrolled On, Progress %, Completed On, Amount</b> and optionally <b>Rating, Review</b>. Students are matched by email; courses by code. Importing again updates existing rows.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <a className="btn sm" href="/api/learning/sample" download><Icon name="download" small />Download template</a>
            <label className="btn sm" htmlFor="ldFile" style={{ cursor: 'pointer' }}><Icon name="file" small />{file ? file.name : 'Choose file'}</label>
            <input id="ldFile" type="file" className="sr" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }} />
            <button className="btn sm primary" disabled={!file || busy} onClick={importFile}><Icon name="upload" small />{busy ? 'Importing…' : 'Import'}</button>
          </div>
          {status?.sample && <label className="checkline" htmlFor="ldReplace"><input id="ldReplace" type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Remove the sample records first</label>}
          {result && <p style={{ margin: 0 }}><b>{result.added}</b> added, <b>{result.updated}</b> updated{result.skippedCount ? <>, <b style={{ color: 'var(--red-ink)' }}>{result.skippedCount}</b> skipped</> : ''}.
            {result.skipped.length > 0 && <span className="note" style={{ display: 'block', whiteSpace: 'pre-line' }}>{result.skipped.join('\n')}</span>}</p>}
        </div>
      </Dialog>
      <Confirm open={confirm} title="Remove sample learner data?" message="All sample students, enrollments, reviews, message threads and course views are deleted. Courses, instructors and anything you imported stay." confirmLabel="Remove sample data"
        onClose={() => setConfirm(false)} onConfirm={async () => { try { const r = await api.post('/api/learning/clear-sample'); toast(`Removed ${r.removed} sample enrollments`); load(); } catch (e) { toast(e.message); } setConfirm(false); }} />
    </>
  );
}
