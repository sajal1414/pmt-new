import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { Dialog, Field } from './ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { api } from '../api.js';
import { STATUSES } from '../lib/constants.js';

// a course's address next to the list page (keeps a ?as= on the instructor area)
const courseUrl = (back, id) => back.replace(/(\?|$)/, `/${id}$1`);
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '').slice(0, 3).toUpperCase(); // 3 letters of the client

/** "Make a custom version" for a client: copies the course's content, tagged with the client and linked to the original. */
export function CustomVersionDialog({ open, course, onClose, back = '/courses', client = '', onCreated }) {
  const nav = useNavigate();
  const toast = useToast();
  const { courses, reload } = useData();
  // names and codes come from the original course, also when copying a client version
  const original = (course.baseCourse && courses.find((c) => c.id === course.baseCourse)) || course;
  const [f, setF] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({}); // name and code follow the client until edited
  // `client`: start with this client filled in (a learner's request)
  useEffect(() => { if (open) { setF({ customFor: client, name: client ? `${original.name} for ${client}` : '', code: client ? `${original.code}-${slug(client)}` : '', status: course.status, schedules: false }); setErrors({}); setTouched({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => {
    setTouched((t) => ({ ...t, [k]: true }));
    setF((s) => {
      const n = { ...s, [k]: v };
      if (k === 'customFor') {
        const who = v.trim();
        if (!touched.name) n.name = who ? `${original.name} for ${who}` : '';
        if (!touched.code) n.code = who ? `${original.code}-${slug(who)}` : '';
      }
      return n;
    });
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!f.customFor.trim()) { setErrors({ customFor: 'Enter the client this version is for.' }); return; }
    setBusy(true); setErrors({});
    try {
      const c = await api.post(`/api/courses/${course.id}/customize`, f);
      await reload(['courses', 'activity']);
      toast(`Created ${c.name}`); await onCreated?.(c); onClose(); nav(courseUrl(back, c.id));
    } catch (err) { setErrors(err.fields || {}); if (!err.fields) toast(err.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} title="Make a custom version" subtitle={`A copy of ${course.code} for one client, linked to the original`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" type="submit" form="cvForm" disabled={busy}><Icon name="plus" small />Create custom version</button></>}>
      {open && (
        <form id="cvForm" className="form" noValidate onSubmit={submit}>
          <Field id="cv-client" className="full" label="Client" placeholder="e.g. Acme Corp" required value={f.customFor} onChange={set('customFor')} error={errors.customFor} />
          <Field id="cv-name" className="full" label="Course name" value={f.name} onChange={set('name')} error={errors.name} />
          <Field id="cv-code" label="Course code" value={f.code} onChange={set('code')} error={errors.code} />
          <Field id="cv-status" label="Status" type="select" options={STATUSES} value={f.status} onChange={set('status')} />
          <label className="full cv-check" htmlFor="cv-sch"><input type="checkbox" id="cv-sch" checked={f.schedules} onChange={(e) => setF((s) => ({ ...s, schedules: e.target.checked }))} />
            Copy the batch schedule too <span className="note">(otherwise the client version starts with no batches)</span></label>
          <p className="note full" style={{ margin: 0 }}>Lessons, topics, objectives, instructors and prices are copied. Change anything afterwards: the original stays as it is. Everyone can see the custom version once it’s published.</p>
        </form>
      )}
    </Dialog>
  );
}

/** Under the course header: "Custom version for X, based on Y" and the other client versions of the same course. */
export function CustomVersions({ course, back = '/courses' }) {
  const { courses } = useData();
  const root = course.baseCourse || course.id;
  const original = course.baseCourse ? courses.find((c) => c.id === course.baseCourse) : null;
  const others = courses.filter((c) => c.id !== course.id && c.baseCourse === root);
  if (!course.customFor && !others.length) return null;
  return (
    <div className="cv-bar">
      {course.customFor && <span className="cv-for"><Icon name="people" small />Custom version for <b>{course.customFor}</b>
        {course.baseCourse && (original ? <> · based on <Link to={courseUrl(back, original.id)}>{original.code} {original.name}</Link></> : <span className="note"> · the original course was deleted</span>)}</span>}
      {others.length > 0 && <span className="cv-list"><span className="note">{course.customFor ? 'Other client versions:' : 'Client versions:'}</span>
        {others.map((c) => <Link key={c.id} className="chip" to={courseUrl(back, c.id)} title={`${c.code} ${c.name}`}>{c.customFor || c.code}</Link>)}</span>}
    </div>
  );
}
