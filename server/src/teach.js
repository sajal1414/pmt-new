// Instructor area API (/api/teach/*). Instructors see only their own courses and learners;
// admins can look at any instructor by adding ?as=<instructorId>.
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { overview, scope, studentsOf, analytics, certificatesOf, reviewOut, teachingCourses, authoredCourses, qualifiedCourses, isAuthor, listsQualified, isoDay, certSigners } from './learning.js';
import { certificatePdf } from './pdf.js';
import { ensureStudent } from './learn.js';
import { phoneOk, PHONE_MSG } from './constants.js';
import { announcementsFor } from './settings.js';

const PROFILE_FIELDS = ['name', 'phone', 'location', 'travel', 'vendor', 'platforms', 'portfolio', 'product', 'skills', 'canTeach', 'qualified', 'languages', 'comments'];
const safeName = (n) => path.basename(String(n)).replace(/[^\w.\-() ]+/g, '_').slice(-120) || 'file';

/** Why a signature can't be stored ('' when it can): it must be a real PNG/JPEG data URL of 300 KB or less; empty removes it. */
export function signatureProblem(sig) {
  if (!sig) return '';
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(sig), buf = m && Buffer.from(m[2], 'base64');
  const real = buf && (m[1] === 'png' ? buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) : buf[0] === 0xff && buf[1] === 0xd8);
  if (!real) return 'Use a PNG or JPEG image for the signature.';
  if (buf.length > 300 * 1024) return 'That signature image is too large (300 KB at most).';
  return '';
}

export function mountTeach(app, { wrap, HttpError, load, save, uid, log, dataDir }) {
  const RES_DIR = path.join(dataDir, 'resources');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  /** The instructor this request is about: the signed-in instructor, or ?as= for admins. */
  const teacher = (req) => {
    const d = load(), admin = req.user.role === 'Admin';
    const id = admin ? String(req.query.as || '') : req.user.instructorId;
    const inst = d.instructors.find((i) => i.id === id);
    if (!inst) throw new HttpError(admin ? 400 : 403, admin ? 'Choose an instructor to view.' : 'Your account isn’t linked to an instructor profile yet. Ask an admin to link it on the Users page.');
    return { d, inst };
  };
  const mineCourse = (d, inst, courseId) => {
    const c = teachingCourses(d, inst).find((x) => x.id === courseId);
    if (!c) throw new HttpError(404, 'That course isn’t one of yours.');
    return c;
  };
  const notifications = (d, inst) => {
    const S = scope(d, inst), since = isoDay(Date.now() - 7 * 864e5), out = [];
    for (const t of d.threads.filter((x) => x.instructorId === inst.id && x.unread)) {
      const last = t.messages[t.messages.length - 1];
      out.push({ kind: 'message', at: last.at, text: `${S.students.get(t.studentId)?.name || 'A learner'} sent you a message`, link: '/teach/messages?thread=' + t.id });
    }
    for (const v of S.reviews.filter((x) => x.date >= since)) out.push({ kind: 'review', at: new Date(v.date).getTime(), text: `New ${v.rating}-star review on ${S.byId.get(v.courseId)?.name}`, link: '/teach/reviews' });
    for (const e of S.enr.filter((x) => x.enrolled >= since)) out.push({ kind: 'enrollment', at: new Date(e.enrolled).getTime(), text: `${S.students.get(e.studentId)?.name || 'A learner'} enrolled in ${S.byId.get(e.courseId)?.name}`, link: '/teach/students' });
    out.push(...announcementsFor(d, 'instructors'));
    return out.sort((a, b) => b.at - a.at).slice(0, 12);
  };

  // who can be viewed (admins: every instructor; instructors: themselves)
  app.get('/api/teach/instructors', wrap((req) => {
    const d = load();
    const list = req.user.role === 'Admin' ? d.instructors : d.instructors.filter((i) => i.id === req.user.instructorId);
    return list.map((i) => ({ id: i.id, name: i.name, email: i.email, courses: teachingCourses(d, i).length })).sort((a, b) => b.courses - a.courses || a.name.localeCompare(b.name));
  }));

  app.get('/api/teach/summary', wrap((req) => {
    const { d, inst } = teacher(req);
    return { instructor: { id: inst.id, name: inst.name, email: inst.email, location: inst.location }, unread: d.threads.filter((t) => t.instructorId === inst.id && t.unread).length, notifications: notifications(d, inst), sample: !!d.sampleLearning };
  }));
  app.get('/api/teach/overview', wrap((req) => { const { d, inst } = teacher(req); return overview(d, inst, req.query); }));
  // My Courses: the courses they teach, author or are qualified to teach. Only authors edit the content; the others can
  // open it and make a custom version (which they then own). Learners, batches and stats only come with teaching.
  app.get('/api/teach/courses', wrap((req) => {
    const { d, inst } = teacher(req); const S = scope(d, inst), taught = new Set(S.courses.map((c) => c.id));
    const seen = new Set(), list = [...S.courses, ...authoredCourses(d, inst), ...qualifiedCourses(d, inst)].filter((c) => !seen.has(c.id) && seen.add(c.id));
    return list.map((c) => { const author = isAuthor(inst, c), teaching = taught.has(c.id); return { ...S.courseStats(c), teaching, authoring: author, qualified: teaching || listsQualified(inst, c), canEdit: author }; });
  }));
  app.get('/api/teach/students', wrap((req) => { const { d, inst } = teacher(req); return studentsOf(d, inst); }));
  app.get('/api/teach/analytics', wrap((req) => { const { d, inst } = teacher(req); return analytics(d, inst, req.query); }));

  /* reviews */
  app.get('/api/teach/reviews', wrap((req) => {
    const { d, inst } = teacher(req), S = scope(d, inst);
    return [...S.reviews].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((v) => reviewOut(v, S));
  }));
  app.post('/api/teach/reviews/:id/reply', wrap((req) => {
    const { d, inst } = teacher(req), S = scope(d, inst);
    const v = S.reviews.find((x) => x.id === req.params.id);
    if (!v) throw new HttpError(404, 'Review not found.');
    v.reply = String(req.body.reply || '').trim().slice(0, 2000);
    v.replied = v.reply ? new Date().toISOString() : '';
    save();
    return reviewOut(v, S);
  }));

  /* messages */
  const threadOut = (d, S, t) => ({ ...t, student: S.students.get(t.studentId)?.name || 'Learner', email: S.students.get(t.studentId)?.email || '', course: S.byId.get(t.courseId)?.name || '', last: t.messages[t.messages.length - 1] });
  app.get('/api/teach/messages', wrap((req) => {
    const { d, inst } = teacher(req), S = scope(d, inst);
    return d.threads.filter((t) => t.instructorId === inst.id).map((t) => threadOut(d, S, t)).sort((a, b) => b.last.at - a.last.at);
  }));
  app.post('/api/teach/messages', wrap((req, res) => {
    const { d, inst } = teacher(req), S = scope(d, inst);
    const text = String(req.body.text || '').trim(), sid = String(req.body.studentId || '');
    if (!S.enr.some((e) => e.studentId === sid)) throw new HttpError(422, 'Choose a learner enrolled in one of your courses.', { studentId: 'Choose a learner.' });
    if (!text) throw new HttpError(422, 'Write a message.', { text: 'Write a message.' });
    let t = d.threads.find((x) => x.instructorId === inst.id && x.studentId === sid);
    if (!t) { t = { id: uid('th'), instructorId: inst.id, studentId: sid, courseId: String(req.body.courseId || S.enr.find((e) => e.studentId === sid).courseId), messages: [], unread: false }; d.threads.push(t); }
    t.messages.push({ from: 'instructor', text: text.slice(0, 4000), at: Date.now() }); t.unread = false; t.learnerUnread = true;
    save(); res.status(201);
    return threadOut(d, S, t);
  }));
  app.post('/api/teach/messages/:id', wrap((req) => {
    const { d, inst } = teacher(req), S = scope(d, inst);
    const t = d.threads.find((x) => x.id === req.params.id && x.instructorId === inst.id);
    if (!t) throw new HttpError(404, 'Conversation not found.');
    const text = String(req.body.text || '').trim();
    if (!text) throw new HttpError(422, 'Write a message.', { text: 'Write a message.' });
    t.messages.push({ from: 'instructor', text: text.slice(0, 4000), at: Date.now() }); t.unread = false; t.learnerUnread = true;
    save();
    return threadOut(d, S, t);
  }));
  app.post('/api/teach/messages/:id/read', wrap((req) => {
    const { d, inst } = teacher(req);
    const t = d.threads.find((x) => x.id === req.params.id && x.instructorId === inst.id);
    if (t && t.unread) { t.unread = false; save(); }
    return { ok: true };
  }));

  /* assign a course to learners by email, with an optional deadline */
  app.post('/api/teach/assign', wrap((req) => {
    const { d, inst } = teacher(req), c = mineCourse(d, inst, String(req.body.courseId || ''));
    const emails = [...new Set(String(req.body.emails || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(req.body.deadline || '') ? req.body.deadline : '';
    const f = {};
    const bad = emails.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (!emails.length) f.emails = 'Enter at least one email address.'; else if (bad.length) f.emails = `Check these: ${bad.slice(0, 3).join(', ')}`;
    if (deadline && deadline < isoDay(Date.now())) f.deadline = 'Pick a date from today on.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    const out = { assigned: 0, updated: 0, newLearners: 0 };
    for (const email of emails) {
      const known = d.students.some((x) => x.email.toLowerCase() === email);
      const st = ensureStudent(d, { email, name: emails.length === 1 ? String(req.body.name || '').trim() : '' }, uid);
      if (!known) out.newLearners++;
      const e = d.enrollments.find((x) => x.studentId === st.id && x.courseId === c.id);
      if (e) { if (deadline) e.deadline = deadline; e.assignedBy ||= inst.id; out.updated++; continue; }
      d.enrollments.push({ id: uid('en'), studentId: st.id, courseId: c.id, enrolled: isoDay(Date.now()), progress: 0, completed: '', lastActive: isoDay(Date.now()), amount: 0, done: [], source: 'assigned', assignedBy: inst.id, deadline });
      out.assigned++;
    }
    log(`${inst.name} assigned ${c.name} to ${emails.length} learner${emails.length > 1 ? 's' : ''}`); save();
    return out;
  }));

  /* certificates */
  app.get('/api/teach/certificates', wrap((req) => { const { d, inst } = teacher(req); return certificatesOf(d, inst); }));
  app.get('/api/teach/certificates/:id/pdf', (req, res, next) => {
    try {
      const { d, inst } = teacher(req);
      const cert = certificatesOf(d, inst).find((c) => c.id === req.params.id);
      if (!cert) throw new HttpError(404, 'Certificate not found.');
      const name = `Certificate ${cert.number} - ${cert.student}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      certificatePdf({ ...cert, signers: certSigners(d, cert.courseId) }, res);
    } catch (e) { next(e); }
  });

  /* resources: files or links an instructor shares, optionally tied to a course */
  app.get('/api/teach/resources', wrap((req) => {
    const { d, inst } = teacher(req), mine = new Map(teachingCourses(d, inst).map((c) => [c.id, c]));
    return d.resources.filter((r) => r.instructorId === inst.id).map((r) => ({ ...r, course: mine.get(r.courseId)?.name || '', code: mine.get(r.courseId)?.code || '' })).sort((a, b) => b.added.localeCompare(a.added));
  }));
  app.post('/api/teach/resources', upload.single('file'), wrap((req, res) => {
    const { d, inst } = teacher(req), f = {};
    const title = String(req.body.title || '').trim() || (req.file ? Buffer.from(req.file.originalname, 'latin1').toString('utf8') : '');
    const url = String(req.body.url || '').trim(), courseId = String(req.body.courseId || '');
    if (courseId) mineCourse(d, inst, courseId);
    if (!req.file && !url) f.file = 'Choose a file or enter a link.';
    if (url && !/^https?:\/\/\S+$/i.test(url)) f.url = 'Enter a link that starts with http:// or https://';
    if (!title) f.title = 'Give the resource a title.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    const r = { id: uid('rs'), instructorId: inst.id, courseId, title: title.slice(0, 200), kind: req.file ? 'file' : 'link', url, filename: '', size: 0, added: new Date().toISOString() };
    if (req.file) {
      r.filename = safeName(Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
      r.size = req.file.size;
      fs.mkdirSync(path.join(RES_DIR, r.id), { recursive: true });
      fs.writeFileSync(path.join(RES_DIR, r.id, r.filename), req.file.buffer);
    }
    d.resources.push(r); log(`${inst.name} added resource “${r.title}”`); save();
    res.status(201); return r;
  }));
  app.delete('/api/teach/resources/:id', wrap((req, res) => {
    const { d, inst } = teacher(req);
    const i = d.resources.findIndex((r) => r.id === req.params.id && r.instructorId === inst.id);
    if (i < 0) throw new HttpError(404, 'Resource not found.');
    const [r] = d.resources.splice(i, 1);
    fs.rmSync(path.join(RES_DIR, path.basename(r.id)), { recursive: true, force: true });
    save(); res.status(204).end();
  }));
  app.get('/api/teach/resources/:id/file', (req, res, next) => {
    try {
      const { d, inst } = teacher(req);
      const r = d.resources.find((x) => x.id === req.params.id && x.instructorId === inst.id && x.kind === 'file');
      const file = r && path.join(RES_DIR, path.basename(r.id), safeName(r.filename));
      if (!file || !fs.existsSync(file)) throw new HttpError(404, 'File not found.');
      res.download(file, r.filename);
    } catch (e) { next(e); }
  });

  /* profile */
  app.get('/api/teach/profile', wrap((req) => { const { inst } = teacher(req); return inst; }));
  app.put('/api/teach/profile', wrap((req) => {
    const { d, inst } = teacher(req), f = {};
    const next = { ...inst };
    for (const k of PROFILE_FIELDS) if (k in req.body) next[k] = k === 'platforms' ? (Array.isArray(req.body[k]) ? req.body[k] : String(req.body[k]).split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean) : String(req.body[k] ?? '').trim();
    if (!next.name) f.name = 'Name is required.';
    if (!phoneOk(next.phone)) f.phone = PHONE_MSG;
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    // courses list instructors by name: keep them pointing at this person after a rename
    if (next.name !== inst.name) d.courses.forEach((c) => { c.instructors = (c.instructors || []).map((n) => (n.trim().toLowerCase() === inst.name.trim().toLowerCase() ? next.name : n)); });
    Object.assign(inst, next); log(`${inst.name} updated their profile`); save();
    return inst;
  }));

  /* signature printed on this instructor's certificates: a PNG/JPEG data URL drawn or uploaded on the profile page */
  app.put('/api/teach/profile/signature', wrap((req) => {
    const { inst } = teacher(req), sig = String(req.body.signature || ''), problem = signatureProblem(sig);
    if (problem) throw new HttpError(422, problem);
    inst.signature = sig; log(`${inst.name} ${sig ? 'saved' : 'removed'} their certificate signature`); save();
    return { signature: sig };
  }));
  app.get('/api/teach/profile/certificate-preview', (req, res, next) => {
    try {
      const { d, inst } = teacher(req);
      const course = teachingCourses(d, inst)[0];
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="Certificate preview.pdf"');
      certificatePdf({ number: 'ATL-PREVIEW', student: 'Sample Learner', course: course?.name || 'Course name', completed: isoDay(Date.now()),
        signers: [{ name: inst.name, title: 'Instructor', signature: inst.signature || '' }] }, res);
    } catch (e) { next(e); }
  });
}
