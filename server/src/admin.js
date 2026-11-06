// Admin dashboard API (/api/admin/*): platform-wide numbers, approvals and the upcoming schedule.
// Everything is worked out from the stored records on each request, so it always matches the other pages.
import { ensureLearning, isoDay } from './learning.js';
import { mountAdminPages } from './admin-pages.js';
import { batchTimes } from './schedule.js';

const DAY = 864e5;
const PUBLISHED = ['Available', 'Published'];
const avg = (list) => (list.length ? Math.round((list.reduce((a, v) => a + v.rating, 0) / list.length) * 10) / 10 : null);
const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
const inRange = (day, from, to) => !!day && day >= from && day <= to;

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the current month; plus the equally long period just before it. */
function period(q) {
  const today = isoDay(Date.now());
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  let from = ok(q.from) ? q.from : today.slice(0, 8) + '01';
  let to = ok(q.to) ? q.to : isoDay(new Date(+from.slice(0, 4), +from.slice(5, 7), 0, 12).getTime());
  if (to < from) [from, to] = [to, from];
  const len = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return { from, to, prevFrom: isoDay(Date.parse(from) - len * DAY), prevTo: isoDay(Date.parse(from) - DAY), days: len };
}

export function mountAdmin(app, opts) {
  const { wrap, HttpError, load, save, log } = opts;
  mountAdminPages(app, opts);
  app.get('/api/admin/dashboard', wrap((req) => {
    const d = load(); ensureLearning(d);
    const P = period(req.query), now = isoDay(Date.now());
    const byId = new Map(d.courses.map((c) => [c.id, c])), student = new Map(d.students.map((s) => [s.id, s]));
    const count = (list, key, a, b) => list.filter((x) => inRange(x[key], a, b)).length;

    // people: learners plus staff accounts, counted once per email
    const emails = new Set([...d.students.map((s) => s.email.toLowerCase()), ...d.users.map((u) => u.email.toLowerCase())]);
    const active = d.enrollments.filter((e) => !e.completed && (+e.progress || 0) < 100);
    const kpis = {
      users: { value: emails.size, added: count(d.students, 'joined', P.from, P.to), change: change(count(d.students, 'joined', P.from, P.to), count(d.students, 'joined', P.prevFrom, P.prevTo)) },
      instructors: { value: d.instructors.length, added: count(d.instructors, 'created', P.from, P.to), locations: new Set(d.instructors.map((i) => i.location).filter(Boolean)).size },
      available: { value: d.courses.filter((c) => PUBLISHED.includes(c.status)).length },
      pipeline: { value: d.courses.filter((c) => ['Pipeline', 'Backlog'].includes(c.status)).length, pipeline: d.courses.filter((c) => c.status === 'Pipeline').length, backlog: d.courses.filter((c) => c.status === 'Backlog').length },
      custom: { value: d.courses.filter((c) => c.customFor).length, clients: new Set(d.courses.filter((c) => c.customFor).map((c) => c.customFor.trim().toLowerCase())).size },
      courses: { platforms: new Set(d.courses.map((c) => c.platform).filter(Boolean)).size, value: d.courses.length, added: count(d.courses, 'created', P.from, P.to), change: change(count(d.courses, 'created', P.from, P.to), count(d.courses, 'created', P.prevFrom, P.prevTo)), published: d.courses.filter((c) => PUBLISHED.includes(c.status)).length },
      enrollments: { value: active.length, added: count(d.enrollments, 'enrolled', P.from, P.to), change: change(count(d.enrollments, 'enrolled', P.from, P.to), count(d.enrollments, 'enrolled', P.prevFrom, P.prevTo)) },
      rating: { value: avg(d.reviews), reviews: d.reviews.length, added: count(d.reviews, 'date', P.from, P.to),
        delta: (() => { const a = avg(d.reviews.filter((v) => inRange(v.date, P.from, P.to))), b = avg(d.reviews.filter((v) => inRange(v.date, P.prevFrom, P.prevTo))); return a != null && b != null ? Math.round((a - b) * 10) / 10 : null; })() }
    };

    // top courses by learners enrolled (all time)
    const per = new Map();
    for (const e of d.enrollments) per.set(e.courseId, (per.get(e.courseId) || 0) + 1);
    const topCourses = [...per].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => {
      const c = byId.get(id) || {}, rv = d.reviews.filter((v) => v.courseId === id);
      return { id, code: c.code, name: c.name, platform: c.platform, enrollments: n, rating: avg(rv), ratings: rv.length };
    }).filter((c) => c.name);
    // not enough enrollment data yet: fill the list with AI courses (published first), then the newest published courses
    if (topCourses.length < 5) {
      const isAI = (c) => c.platform === 'AI' || /(ai|watsonx|generative|machine learning|llm)/i.test(`${c.name} ${c.product}`);
      const live = (c) => (PUBLISHED.includes(c.status) ? 0 : 1);
      const pool = [...d.courses.filter(isAI).sort((a, b) => live(a) - live(b) || String(a.code).localeCompare(String(b.code))),
        ...d.courses.filter((c) => !isAI(c) && PUBLISHED.includes(c.status)).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))];
      for (const c of pool) {
        if (topCourses.length >= 5) break;
        if (topCourses.some((t) => t.id === c.id)) continue;
        const rv = d.reviews.filter((v) => v.courseId === c.id);
        topCourses.push({ id: c.id, code: c.code, name: c.name, platform: c.platform, status: c.status, enrollments: per.get(c.id) || 0, rating: avg(rv), ratings: rv.length, featured: isAI(c) ? 'ai' : 'new' });
      }
    }

    // recent activity across learners, reviews, certificates and admin changes
    const ev = [];
    const at = (day) => Date.parse(day + 'T12:00:00');
    for (const s of d.students) if (s.joined) ev.push({ kind: 'user', at: at(s.joined), day: true, title: 'New learner registered', text: `${s.name} joined the platform` });
    for (const e of d.enrollments) {
      const s = student.get(e.studentId)?.name || 'A learner', c = byId.get(e.courseId)?.name || 'a course';
      if (e.enrolled) ev.push({ kind: 'enroll', at: at(e.enrolled), day: true, title: e.source === 'assigned' ? 'Course assigned' : 'New enrollment', text: `${s} enrolled in ${c}` });
      if (e.completed) ev.push({ kind: 'cert', at: at(e.completed) + 1, day: true, title: 'Certificate issued', text: `${s} completed ${c}` });
    }
    for (const v of d.reviews) ev.push({ kind: 'review', at: at(v.date) + 2, day: true, title: 'Review submitted', text: `${student.get(v.studentId)?.name || 'A learner'} rated ${byId.get(v.courseId)?.name || 'a course'} ${v.rating}★` });
    // admin log lines carry their own wording: give each a short title
    const kindOf = (t) => (/ enrolled /.test(t) ? ['enroll', 'New enrollment'] : / assigned /.test(t) ? ['assign', 'Course assigned'] : /approved/.test(t) ? ['ok', 'Approved']
      : /deleted|removed|rejected/.test(t) ? ['remove', 'Removed'] : /added|created|imported/i.test(t) ? ['add', 'Added'] : ['update', 'Updated']);
    for (const a of d.activity) { const [kind, title] = kindOf(a.text); ev.push({ kind, at: a.t, day: false, title, text: a.text }); }
    const activity = ev.filter((x) => x.at <= Date.now() + DAY).sort((a, b) => b.at - a.at).slice(0, 6);

    // things waiting for an admin
    const pendingCourses = d.courses.filter((c) => c.status === 'For Review').map((c) => ({ id: c.id, code: c.code, name: c.name, platform: c.platform, by: (c.instructors || [])[0] || c.author || '', date: c.created || '' }));
    const pendingInstructors = d.users.filter((u) => u.status === 'Pending approval').map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, by: d.instructors.find((i) => i.id === u.instructorId)?.name || '' }));
    const since = isoDay(Date.now() - 30 * DAY);
    const pendingReviews = d.reviews.filter((v) => !v.approved && v.date >= since).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map((v) => ({ id: v.id, rating: v.rating, comment: v.comment || '', course: byId.get(v.courseId)?.name || '', courseId: v.courseId, by: student.get(v.studentId)?.name || 'Learner', date: v.date }));

    // the next 60 days: learner deadlines, batch start dates and course release / retirement dates
    const until = isoDay(Date.now() + 60 * DAY), sched = [];
    const dl = new Map();
    for (const e of d.enrollments) if (e.deadline && e.deadline >= now && e.deadline <= until && !e.completed) { const k = e.courseId + '|' + e.deadline; dl.set(k, (dl.get(k) || 0) + 1); }
    for (const [k, n] of dl) { const [id, date] = k.split('|'); sched.push({ kind: 'deadline', date, title: `Course deadline: ${byId.get(id)?.name || 'Course'}`, text: `For ${n} enrolled learner${n === 1 ? '' : 's'}`, courseId: id }); }
    for (const c of d.courses) {
      for (const [f, label] of [['release', 'Release'], ['planned', 'Planned completion'], ['retire', 'Retirement']]) {
        const v = String(c[f] || '').slice(0, 10);
        if (inRange(v, now, until)) sched.push({ kind: f, date: v, title: `${label}: ${c.name}`, text: [c.code, (c.instructors || [])[0] && `By ${c.instructors[0]}`].filter(Boolean).join(' · '), courseId: c.id });
      }
    }
    for (const c of d.courses) for (const b of c.schedules || []) {
      if (b.status !== 'Cancelled' && inRange(b.startDate, now, until)) sched.push({ kind: 'batch', date: b.startDate, title: `Batch starts: ${c.name}`, text: [c.code, batchTimes(b), b.mode].filter(Boolean).join(' · '), courseId: c.id });
    }
    sched.sort((a, b) => a.date.localeCompare(b.date));

    return { period: P, kpis, totalActive: active.length, topCourses, activity,
      approvals: { courses: pendingCourses, instructors: pendingInstructors, reviews: pendingReviews.slice(0, 20), reviewsTotal: pendingReviews.length },
      schedule: sched.slice(0, 8) };
  }));

  /* approve / reject from the dashboard */
  app.post('/api/admin/approvals/:kind/:id/:action', wrap((req) => {
    const d = load(), { kind, id, action } = req.params, ok = action === 'approve';
    if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Unknown action.');
    if (kind === 'courses') {
      const c = d.courses.find((x) => x.id === id);
      if (!c) throw new HttpError(404, 'Course not found.');
      c.status = ok ? 'Available' : 'In Development';
      log(ok ? `Course ${c.code} approved and published` : `Course ${c.code} sent back to development`);
    } else if (kind === 'instructors') {
      const i = d.users.findIndex((x) => x.id === id);
      if (i < 0) throw new HttpError(404, 'User not found.');
      const u = d.users[i];
      if (ok) { u.status = 'Active'; log(`User ${u.name || u.email} approved`); } else { d.users.splice(i, 1); log(`Sign-up from ${u.email} rejected`); }
    } else if (kind === 'reviews') {
      const i = d.reviews.findIndex((x) => x.id === id);
      if (i < 0) throw new HttpError(404, 'Review not found.');
      if (ok) d.reviews[i].approved = true; else { d.reviews.splice(i, 1); log('A learner review was removed'); }
    } else throw new HttpError(400, 'Unknown approval type.');
    save();
    return { ok: true };
  }));
}
