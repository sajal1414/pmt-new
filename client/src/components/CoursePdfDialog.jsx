import { useState } from 'react';
import Icon from './Icon.jsx';
import { Dialog } from './ui.jsx';
import { useToast } from '../lib/store.jsx';
import { downloadCoursePdfs } from '../lib/download.js';

// what a course PDF can show (the course name is always there); keys match PDF_FIELDS on the server
const GROUPS = [
  ['Course details', [['code', 'Course code'], ['ibmCode', 'IBM course codes'], ['vendor', 'Vendor'], ['platform', 'Platform'], ['product', 'Product'], ['portfolio', 'Portfolio'],
    ['delivery', 'Modality'], ['duration', 'Duration'], ['skill', 'Skill level'], ['status', 'Status'], ['instructors', 'Instructors'], ['maxStudents', 'Max students']]],
  ['Sections', [['description', 'Course description'], ['objectives', 'What you’ll learn'], ['persona', 'Who it’s for'], ['prereqs', 'Prerequisites'], ['outline', 'Course outline']]],
  ['In the outline', [['lessonTimes', 'Lesson durations'], ['notes', 'Lesson notes and points'], ['exercises', 'Labs and exercises']]],
  ['Page', [['logos', 'Hazdemy and IBM logos']]]
];
const ALL = GROUPS.flatMap(([, list]) => list.map(([k]) => k));
const OUTLINE_PARTS = ['lessonTimes', 'notes', 'exercises'];
// the choice is kept in this browser for next time
const read = () => { try { const v = JSON.parse(localStorage.getItem('atlas-pdf-fields')); return Array.isArray(v) ? v.filter((k) => ALL.includes(k)) : ALL; } catch { return ALL; } };
const write = (v) => { try { localStorage.setItem('atlas-pdf-fields', JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Choose what goes into the course PDF, then download it (one PDF, or a ZIP for several courses). */
export default function CoursePdfDialog({ ids, onClose }) {
  const toast = useToast();
  const [fields, setFieldsState] = useState(read);
  const [busy, setBusy] = useState(false);
  const setFields = (v) => { setFieldsState(v); write(v); };
  const flip = (k) => setFields(fields.includes(k) ? fields.filter((x) => x !== k) : [...fields, k]);
  const n = ids?.length || 0;
  const download = async () => {
    setBusy(true);
    try {
      const got = await downloadCoursePdfs(ids, fields.length === ALL.length ? undefined : fields);
      if (got > 1) toast(`Downloaded ${got} course PDFs`);
      onClose();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!ids} onClose={onClose} wide title={n > 1 ? `Download ${n} course PDFs` : 'Download course PDF'} subtitle="Choose what to include. The course name is always shown."
      footer={<>
        <button className="btn sm" onClick={() => setFields(ALL)} disabled={fields.length === ALL.length}><Icon name="check" small />Select all</button>
        <button className="btn sm" onClick={() => setFields([])} disabled={!fields.length}><Icon name="x" small />Clear all</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !n} onClick={download}><Icon name="download" small />{busy ? 'Creating…' : n > 1 ? `Download ${n} PDFs (ZIP)` : 'Download PDF'}</button>
      </>}>
      <div className="form" style={{ gridTemplateColumns: '1fr' }}>
        {GROUPS.map(([title, list]) => {
          const keys = list.map(([k]) => k), on = keys.filter((k) => fields.includes(k)).length;
          return (
            <fieldset key={title} className="cat-set">
              <legend>
                <label className="cat-opt" style={{ padding: 0 }}>
                  <input type="checkbox" checked={on === keys.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < keys.length; }}
                    onChange={() => setFields(on === keys.length ? fields.filter((k) => !keys.includes(k)) : [...new Set([...fields, ...keys])])} />
                  <span>{title}</span>
                </label>
              </legend>
              <div className="cat-cols two">{list.map(([k, l]) => {
                const off = OUTLINE_PARTS.includes(k) && !fields.includes('outline');
                return <label key={k} className="cat-opt" title={off ? 'Turn on “Course outline” to include this' : undefined} style={off ? { opacity: 0.5 } : undefined}>
                  <input type="checkbox" checked={fields.includes(k)} disabled={off} onChange={() => flip(k)} /><span>{l}</span></label>;
              })}</div>
            </fieldset>
          );
        })}
      </div>
    </Dialog>
  );
}
