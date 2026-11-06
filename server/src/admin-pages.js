// API for the admin sidebar pages: enrollments, assignments, content, reviews, certificates, reports,
// payments, notifications and site settings. Admin only (see ADMIN_ONLY in index.js).
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ensureLearning, isoDay, certNumber, teachingCourses, certSigners } from './learning.js';
import { ensureStudent } from './learn.js';
import { certificatePdf } from './pdf.js';
import { settingsOf, payConfig, DEFAULT_SETTINGS, CURRENCIES } from './settings.js';
import { EMAIL } from './constants.js';
import { sampleMode } from './seed.js';

const DAY = 864e5;
const avg = (list) => (list.length ? Math.round((list.reduce((a, v) => a + v.rating, 0) / list.length) * 10) / 10 : null);
const money = (n) => Math.round((+n || 0) * 100) / 100;
const safeName = (n) => path.basename(String(n)).replace(/[^\w.\-() ]+/g, '_').slice(-120) || 'file';
const emailsOf = (s) => [...new Set(String(s || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];

export function mountAdminPages(app, { wrap, HttpError, load, save, uid, log, backup, dataFile, reset, afterReset }) {
  const RES_DIR = path.join(path.dirname(dataFile), 'resources');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  const ctx = () => {
    const d = load(); ensureLearning(d);
    return { d, course: new Map(d.courses.map((c) => [c.id, c])), student: new Map(d.students.map((s) => [s.id, s])), inst: new Map(d.instructors.map((i) => [i.id, i])) };
  };
  const instructorOf = (d, c) => (c?.instructors || [])[0] || '';
  const enrOut = (C, e) => {
    const c = C.course.get(e.courseId), s = C.student.get(e.studentId);
    const today = isoDay(Date.now());
    return { id: e.id, studentId: e.studentId, student: s?.name || 'Learner', email: s?.email || '', sample: !!e.sample, courseId: e.courseId, code: c?.code || '', course: c?.name || '(deleted course)', platform: c?.platform || '',
      instructor: instructorOf(C.d, c), batch: (() => { const b = (c?.schedules || []).find((x) => x.id === e.batchId); return b ? { startDate: b.startDate, endDate: b.endDate } : null; })(), source: e.source || (e.sample ? 'sample' : 'purchase'), assignedBy: e.assignedBy === 'admin' ? 'Admin' : C.inst.get(e.assignedBy)?.name || '',
      enrolled: e.enrolled || '', lastActive: e.lastActive || '', progress: +e.progress || 0, completed: e.completed || '', deadline: e.deadline || '', amount: money(e.amount), payment: e.paymentStatus || '',
      status: e.completed ? 'Completed' : e.deadline && e.deadline < today ? 'Overdue' : (+e.progress || 0) > 0 ? 'In progress' : 'Not started' };
  };

  /* ---------- enrollments ---------- */
  app.get('/api/admin/enrollments', wrap(() => { const C = ctx(); return C.d.enrollments.map((e) => enrOut(C, e)).sort((a, b) => (b.enrolled || '').localeCompare(a.enrolled || '')); }));
  // enroll / assign learners (by email) to a course, optionally with a deadline
  app.post('/api/admin/enrollments', wrap((req, res) => {
    const { d } = ctx(), c = d.courses.find((x) => x.id === String(req.body.courseId || ''));
    const emails = emailsOf(req.body.emails), deadline = /^\d{4}-\d{2}-\d{2}$/.test(req.body.deadline || '') ? req.body.deadline : '', f = {};
    if (!c) f.courseId = 'Choose a course.';
    const bad = emails.filter((x) => !EMAIL.test(x));
    if (!emails.length) f.emails = 'Enter at least one email address.'; else if (bad.length) f.emails = `Check these: ${bad.slice(0, 3).join(', ')}`;
    if (deadline && deadline < isoDay(Date.now())) f.deadline = 'Pick a date from today on.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    const out = { assigned: 0, updated: 0, newLearners: 0 };
    for (const email of emails) {
      const known = d.students.some((x) => x.email.toLowerCase() === email);
      const st = ensureStudent(d, { email, name: emails.length === 1 ? String(req.body.name || '').trim() : '' }, uid);
      if (!known) out.newLearners++;
      const e = d.enrollments.find((x) => x.studentId === st.id && x.courseId === c.id);
      if (e) { if (deadline) e.deadline = deadline; out.updated++; continue; }
      d.enrollments.push({ id: uid('en'), studentId: st.id, courseId: c.id, enrolled: isoDay(Date.now()), progress: 0, completed: '', lastActive: isoDay(Date.now()), amount: 0, done: [], source: 'assigned', assignedBy: 'admin', deadline });
      out.assigned++;
    }
    log(`Admin assigned ${c.name} to ${emails.length} learner${emails.length > 1 ? 's' : ''}`); save();
    res.status(201); return out;
  }));
  app.put('/api/admin/enrollments/:id', wrap((req) => {
    const C = ctx(), e = C.d.enrollments.find((x) => x.id === req.params.id);
    if (!e) throw new HttpError(404, 'Enrollment not found.');
    if ('deadline' in req.body) {
      const dl = String(req.body.deadline || '');
      if (dl && !/^\d{4}-\d{2}-\d{2}$/.test(dl)) throw new HttpError(422, 'Enter a valid date.', { deadline: 'Enter a valid date.' });
      e.deadline = dl;
    }
    save(); return enrOut(C, e);
  }));
  app.delete('/api/admin/enrollments/:id', wrap((req, res) => {
    const C = ctx(), i = C.d.enrollments.findIndex((x) => x.id === req.params.id);
    if (i < 0) throw new HttpError(404, 'Enrollment not found.');
    const [e] = C.d.enrollments.splice(i, 1);
    log(`Removed ${C.student.get(e.studentId)?.name || 'a learner'} from ${C.course.get(e.courseId)?.name || 'a course'}`); save();
    res.status(204).end();
  }));

  /* ---------- assignments: assigned enrollments grouped by course + deadline ---------- */
  app.get('/api/admin/assignments', wrap(() => {
    const C = ctx(), groups = new Map(), today = isoDay(Date.now());
    for (const e of C.d.enrollments.filter((x) => x.source === 'assigned')) {
      const k = `${e.courseId}|${e.deadline || ''}|${e.assignedBy || ''}`;
      if (!groups.has(k)) {
        const c = C.course.get(e.courseId);
        groups.set(k, { id: k, courseId: e.courseId, code: c?.code || '', course: c?.name || '(deleted course)', deadline: e.deadline || '', assignedBy: e.assignedBy === 'admin' ? 'Admin' : C.inst.get(e.assignedBy)?.name || 'Instructor', assigned: e.enrolled, learners: [] });
      }
      const g = groups.get(k); g.learners.push(enrOut(C, e)); if (e.enrolled < g.assigned) g.assigned = e.enrolled;
    }
    return [...groups.values()].map((g) => {
      const done = g.learners.filter((l) => l.completed).length, started = g.learners.filter((l) => !l.completed && l.progress > 0).length;
      const overdue = g.deadline && g.deadline < today ? g.learners.filter((l) => !l.completed).length : 0;
      return { ...g, total: g.learners.length, done, started, notStarted: g.learners.length - done - started, overdue, avgProgress: Math.round(g.learners.reduce((a, l) => a + l.progress, 0) / g.learners.length) };
    }).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  }));
  // change the deadline for everyone in an assignment group
  app.put('/api/admin/assignments/deadline', wrap((req) => {
    const { d } = ctx(), ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [], dl = String(req.body.deadline || '');
    if (dl && !/^\d{4}-\d{2}-\d{2}$/.test(dl)) throw new HttpError(422, 'Enter a valid date.', { deadline: 'Enter a valid date.' });
    let n = 0; for (const e of d.enrollments) if (ids.includes(e.id)) { e.deadline = dl; n++; }
    save(); return { updated: n };
  }));

  /* ---------- content management ---------- */
  app.get('/api/admin/content', wrap(() => {
    const C = ctx(), res = C.d.resources || [];
    const courses = C.d.courses.map((c) => {
      const ls = c.lessons || [];
      return { id: c.id, code: c.code, name: c.name, status: c.status, platform: c.platform, instructor: instructorOf(C.d, c),
        lessons: ls.length, days: new Set(ls.map((l) => l.day).filter(Boolean)).size, minutes: ls.reduce((a, l) => a + (+l.mins || 0), 0),
        topics: !!String(c.topics || '').replace(/<[^>]+>/g, '').trim(), objectives: !!String(c.objectives || '').replace(/<[^>]+>/g, '').trim(), description: !!String(c.description || '').replace(/<[^>]+>/g, '').trim(),
        outline: c.outline || '', outlineStatus: c.outlineStatus || '', resources: res.filter((r) => r.courseId === c.id).length };
    });
    const resources = res.map((r) => ({ ...r, course: C.course.get(r.courseId)?.name || '', code: C.course.get(r.courseId)?.code || '', owner: r.instructorId ? C.inst.get(r.instructorId)?.name || 'Instructor' : 'Admin' }))
      .sort((a, b) => (b.added || '').localeCompare(a.added || ''));
    return { courses, resources };
  }));
  app.post('/api/admin/resources', upload.single('file'), wrap((req, res) => {
    const { d } = ctx(), f = {};
    const title = String(req.body.title || '').trim() || (req.file ? Buffer.from(req.file.originalname, 'latin1').toString('utf8') : '');
    const url = String(req.body.url || '').trim(), courseId = String(req.body.courseId || '');
    if (courseId && !d.courses.some((c) => c.id === courseId)) f.courseId = 'Choose a course from the list.';
    if (!req.file && !url) f.file = 'Choose a file or enter a link.';
    if (url && !/^https?:\/\/\S+$/i.test(url)) f.url = 'Enter a link that starts with http:// or https://';
    if (!title) f.title = 'Give the resource a title.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    const c = d.courses.find((x) => x.id === courseId), owner = c ? d.instructors.find((i) => teachingCourses(d, i).some((x) => x.id === c.id)) : null;
    const r = { id: uid('rs'), instructorId: owner?.id || '', courseId, title: title.slice(0, 200), kind: req.file ? 'file' : 'link', url, filename: '', size: 0, added: new Date().toISOString(), by: 'admin' };
    if (req.file) {
      r.filename = safeName(Buffer.from(req.file.originalname, 'latin1').toString('utf8')); r.size = req.file.size;
      fs.mkdirSync(path.join(RES_DIR, r.id), { recursive: true }); fs.writeFileSync(path.join(RES_DIR, r.id, r.filename), req.file.buffer);
    }
    (d.resources ||= []).push(r); log(`Admin added resource “${r.title}”`); save();
    res.status(201); return r;
  }));
  app.delete('/api/admin/resources/:id', wrap((req, res) => {
    const { d } = ctx(), i = (d.resources || []).findIndex((r) => r.id === req.params.id);
    if (i < 0) throw new HttpError(404, 'Resource not found.');
    const [r] = d.resources.splice(i, 1);
    fs.rmSync(path.join(RES_DIR, path.basename(r.id)), { recursive: true, force: true });
    log(`Admin removed resource “${r.title}”`); save(); res.status(204).end();
  }));
  app.get('/api/admin/resources/:id/file', (req, res, next) => {
    try {
      const { d } = ctx(), r = (d.resources || []).find((x) => x.id === req.params.id && x.kind === 'file');
      const file = r && path.join(RES_DIR, path.basename(r.id), safeName(r.filename));
      if (!file || !fs.existsSync(file)) throw new HttpError(404, 'File not found.');
      res.download(file, r.filename);
    } catch (e) { next(e); }
  });

  /* ---------- reviews ---------- */
  app.get('/api/admin/reviews', wrap(() => {
    const C = ctx();
    return C.d.reviews.map((v) => {
      const c = C.course.get(v.courseId), s = C.student.get(v.studentId);
      return { id: v.id, rating: v.rating, comment: v.comment || '', instructorRating: v.instructorRating || null, instructorComment: v.instructorComment || '', instructor: v.instructorName || instructorOf(C.d, c),
        student: s?.name || 'Learner', email: s?.email || '', sample: !!v.sample, courseId: v.courseId, code: c?.code || '', course: c?.name || '', platform: c?.platform || '', date: v.date || '', reply: v.reply || '', approved: !!v.approved };
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }));
  app.post('/api/admin/reviews/:id/reply', wrap((req) => {
    const { d } = ctx(), v = d.reviews.find((x) => x.id === req.params.id);
    if (!v) throw new HttpError(404, 'Review not found.');
    v.reply = String(req.body.reply || '').trim().slice(0, 2000); v.replied = new Date().toISOString(); v.replySeen = false; v.approved = true;
    save(); return { ok: true, reply: v.reply };
  }));
  app.delete('/api/admin/reviews/:id', wrap((req, res) => {
    const { d } = ctx(), i = d.reviews.findIndex((x) => x.id === req.params.id);
    if (i < 0) throw new HttpError(404, 'Review not found.');
    d.reviews.splice(i, 1); log('A learner review was removed'); save(); res.status(204).end();
  }));

  /* ---------- certificates ---------- */
  const certs = (C) => C.d.enrollments.filter((e) => e.completed && C.course.get(e.courseId)).map((e) => {
    const c = C.course.get(e.courseId), s = C.student.get(e.studentId);
    return { id: e.id, number: certNumber(e), student: s?.name || 'Learner', email: s?.email || '', sample: !!e.sample, courseId: c.id, code: c.code, course: c.name, platform: c.platform || '', instructor: instructorOf(C.d, c), completed: e.completed, hours: c.hours || '' };
  }).sort((a, b) => b.completed.localeCompare(a.completed));
  app.get('/api/admin/certificates', wrap(() => certs(ctx())));
  app.get('/api/admin/certificates/:id/pdf', (req, res, next) => {
    try {
      const cert = certs(ctx()).find((c) => c.id === req.params.id);
      if (!cert) throw new HttpError(404, 'Certificate not found.');
      const name = `Certificate ${cert.number} - ${cert.student}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      certificatePdf({ ...cert, signers: certSigners(load(), cert.courseId) }, res);
    } catch (e) { next(e); }
  });

  /* ---------- reports ---------- */
  app.get('/api/admin/reports', wrap((req) => {
    const C = ctx(), ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const to = ok(req.query.to) ? req.query.to : isoDay(Date.now()), from = ok(req.query.from) ? req.query.from : isoDay(Date.parse(to) - 364 * DAY);
    const inR = (day) => !!day && day >= from && day <= to;
    const E = C.d.enrollments, paid = (e) => e.paymentStatus !== 'pending' && e.paymentStatus !== 'failed';
    // one row per month in the range
    const months = [], start = new Date(from + 'T12:00:00'), end = new Date(to + 'T12:00:00');
    for (let m = new Date(start.getFullYear(), start.getMonth(), 1, 12); m <= end && months.length < 36; m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12)) {
      const key = isoDay(m.getTime()).slice(0, 7), within = (day) => String(day || '').slice(0, 7) === key && inR(day);
      months.push({ month: key, enrollments: E.filter((e) => within(e.enrolled)).length, completions: E.filter((e) => within(e.completed)).length,
        revenue: money(E.filter((e) => within(e.enrolled) && paid(e)).reduce((a, e) => a + (+e.amount || 0), 0)), learners: C.d.students.filter((s) => within(s.joined)).length });
    }
    const rowFor = (list, reviews) => ({ enrollments: list.length, completions: list.filter((e) => e.completed).length, completionRate: list.length ? Math.round((list.filter((e) => e.completed).length / list.length) * 100) : 0,
      avgProgress: list.length ? Math.round(list.reduce((a, e) => a + (+e.progress || 0), 0) / list.length) : 0, revenue: money(list.filter(paid).reduce((a, e) => a + (+e.amount || 0), 0)), rating: avg(reviews), ratings: reviews.length });
    const inPeriod = E.filter((e) => inR(e.enrolled)), revIn = C.d.reviews.filter((v) => inR(v.date));
    const platforms = [...new Set(C.d.courses.map((c) => c.platform || 'Other'))].map((p) => {
      const ids = new Set(C.d.courses.filter((c) => (c.platform || 'Other') === p).map((c) => c.id));
      return { platform: p, courses: ids.size, ...rowFor(inPeriod.filter((e) => ids.has(e.courseId)), revIn.filter((v) => ids.has(v.courseId))) };
    }).sort((a, b) => b.enrollments - a.enrollments);
    const courses = C.d.courses.map((c) => ({ id: c.id, code: c.code, name: c.name, platform: c.platform || '', status: c.status, ...rowFor(inPeriod.filter((e) => e.courseId === c.id), revIn.filter((v) => v.courseId === c.id)) }))
      .filter((r) => r.enrollments || r.ratings).sort((a, b) => b.enrollments - a.enrollments);
    const instructors = C.d.instructors.map((i) => {
      const ids = new Set(teachingCourses(C.d, i).map((c) => c.id));
      return { id: i.id, name: i.name, courses: ids.size, learners: new Set(inPeriod.filter((e) => ids.has(e.courseId)).map((e) => e.studentId)).size, ...rowFor(inPeriod.filter((e) => ids.has(e.courseId)), revIn.filter((v) => ids.has(v.courseId))) };
    }).filter((r) => r.courses).sort((a, b) => b.enrollments - a.enrollments);
    return { from, to, totals: { ...rowFor(inPeriod, revIn), learners: new Set(inPeriod.map((e) => e.studentId)).size, newLearners: C.d.students.filter((s) => inR(s.joined)).length }, months, platforms, courses, instructors, currency: payConfig(C.d).currency };
  }));

  /* ---------- payments ---------- */
  app.get('/api/admin/payments', wrap(() => {
    const C = ctx(), cfg = payConfig(C.d);
    const list = (C.d.payments || []).map((p) => ({ ...p, student: C.student.get(p.studentId)?.name || 'Learner', email: C.student.get(p.studentId)?.email || '', course: C.course.get(p.courseId)?.name || '', code: C.course.get(p.courseId)?.code || '' }))
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    // enrollments that recorded an amount but came from an import or sample data, so have no payment record
    const recorded = C.d.enrollments.filter((e) => +e.amount > 0 && !e.paymentId).length;
    const sum = (st) => money(list.filter((p) => st.includes(p.status)).reduce((a, p) => a + (+p.amount || 0), 0));
    return { config: { razorpay: cfg.razorpay, cod: cfg.cod, currency: cfg.currency }, payments: list, totals: { paid: sum(['paid']), pending: sum(['pending', 'created']), refunded: sum(['refunded']), failed: list.filter((p) => p.status === 'failed').length }, otherEnrollments: recorded };
  }));
  app.post('/api/admin/payments/:id/status', wrap((req) => {
    const { d } = ctx(), p = (d.payments || []).find((x) => x.id === req.params.id), status = String(req.body.status || '');
    if (!p) throw new HttpError(404, 'Payment not found.');
    if (!['paid', 'refunded', 'failed', 'pending'].includes(status)) throw new HttpError(400, 'Unknown status.');
    p.status = status; if (status === 'paid') p.paidAt ||= new Date().toISOString(); if (status === 'refunded') p.refundedAt = new Date().toISOString();
    const e = d.enrollments.find((x) => x.id === p.enrollmentId); if (e) e.paymentStatus = status;
    log(`Payment ${p.id} marked ${status}`); save(); return p;
  }));

  /* ---------- notifications & announcements ---------- */
  app.get('/api/admin/notifications', wrap(() => { const { d } = ctx(); return { activity: d.activity, announcements: [...(d.announcements || [])].sort((a, b) => b.at.localeCompare(a.at)) }; }));
  app.post('/api/admin/announcements', wrap((req, res) => {
    const { d } = ctx(), title = String(req.body.title || '').trim(), text = String(req.body.text || '').trim(), audience = String(req.body.audience || 'all'), f = {};
    if (!title) f.title = 'Give the announcement a title.';
    if (!['all', 'learners', 'instructors'].includes(audience)) f.audience = 'Choose who should see it.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    const a = { id: uid('an'), title: title.slice(0, 140), text: text.slice(0, 1000), audience, at: new Date().toISOString() };
    (d.announcements ||= []).push(a); log(`Announcement sent to ${audience}: ${a.title}`); save();
    res.status(201); return a;
  }));
  app.delete('/api/admin/announcements/:id', wrap((req, res) => {
    const { d } = ctx(), i = (d.announcements || []).findIndex((a) => a.id === req.params.id);
    if (i < 0) throw new HttpError(404, 'Announcement not found.');
    d.announcements.splice(i, 1); save(); res.status(204).end();
  }));

  /* ---------- site settings ---------- */
  app.get('/api/admin/settings', wrap(() => { const { d } = ctx(), cfg = payConfig(d); return { settings: settingsOf(d), currencies: CURRENCIES, env: { razorpay: cfg.razorpay, envCurrency: (process.env.PAYMENT_CURRENCY || 'USD').toUpperCase(), envCod: process.env.PAYMENT_COD !== 'false' }, data: { file: path.basename(dataFile), courses: d.courses.length, instructors: d.instructors.length, users: d.users.length, learners: d.students.length } }; }));
  app.put('/api/admin/settings', wrap((req) => {
    const { d } = ctx(), b = req.body || {}, f = {}, next = settingsOf(d);
    for (const k of ['siteName', 'supportEmail', 'supportPhone']) if (k in b) next[k] = String(b[k] ?? '').trim().slice(0, 120);
    for (const k of ['cod', 'learnerSignup', 'instructorSignup', 'allowRemember', 'emailOn']) if (k in b) next[k] = !!b[k];
    const int = (k, lo, hi, msg) => { if (!(k in b)) return; const v = Math.round(+b[k]); if (!(v >= lo && v <= hi)) f[k] = msg; else next[k] = v; };
    int('sessionHours', 1, 72, 'Use 1 to 72 hours.'); int('lockAfter', 3, 20, 'Use 3 to 20 attempts.'); int('lockMinutes', 1, 240, 'Use 1 to 240 minutes.');
    if ('learnerStatuses' in b) next.learnerStatuses = [...new Set((Array.isArray(b.learnerStatuses) ? b.learnerStatuses : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 50);
    if ('currency' in b) next.currency = CURRENCIES.includes(String(b.currency).toUpperCase()) ? String(b.currency).toUpperCase() : '';
    if (!next.siteName) f.siteName = 'Enter a name.';
    if (next.supportEmail && !EMAIL.test(next.supportEmail)) f.supportEmail = 'Enter an email like support@company.com.';
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    d.settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, next[k]]));
    log('Site settings updated'); save(); return d.settings;
  }));
  // full data download, so there is always a copy before risky changes
  app.get('/api/admin/backup', (req, res, next) => {
    try {
      const name = `atlas-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      res.send(JSON.stringify(load(), null, 2));
    } catch (e) { next(e); }
  });
  // removes all data (or restores the samples with ATLAS_SAMPLE_DATA=1): keeps a backup file next to the data first, and needs the typed word
  app.post('/api/admin/reset-data', wrap((req) => {
    if (String(req.body.confirm || '') !== 'RESET') throw new HttpError(422, 'Type RESET to confirm.', { confirm: 'Type RESET to confirm.' });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
    const keep = backup(`atlas.backup-before-reset-${stamp}.json`);
    reset(); afterReset();
    return { ok: true, backup: path.basename(keep), sample: sampleMode() };
  }));
}
