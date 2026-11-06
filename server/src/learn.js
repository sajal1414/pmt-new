// Learner area API (/api/learn/*). A learner is a user with role "Learner" linked to a student record
// (user.studentId); admins can look at any student with ?as=<studentId>.
import { isoDay, certNumber, certSigners } from './learning.js';
import { certificatePdf } from './pdf.js';
import { createOrder, verifySignature } from './payments.js';
import { payConfig, announcementsFor, learnerSees, settingsOf } from './settings.js';
import { sendLater } from './mail.js';
import { isHtml } from './richtext.js';
import { upcomingBatches, publicBatch, batchOf, lessonOpens, todayIn } from './schedule.js';

const LEVEL = { Foundational: 'Beginner', Intermediate: 'Intermediate', Advanced: 'Advanced' };
const plain = (s) => (isHtml(s) ? String(s).replace(/<li>/g, ' • ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : String(s || '')).replace(/\s+/g, ' ').trim();

/** Find or create the student record for an email (used by sign-up, role changes and instructor assignment). */
export function ensureStudent(d, { email, name }, uid) {
  d.students ||= [];
  let s = d.students.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
  if (!s) { s = { id: uid('st'), name: name || String(email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()), email: String(email).trim(), location: '', joined: isoDay(Date.now()) }; d.students.push(s); }
  else if (name && s.sample) { s.name = name; }
  return s;
}

export function mountLearn(app, { wrap, HttpError, load, save, uid, log }) {
  /** The student this request is about: the signed-in learner, or ?as= for admins. */
  const learner = (req) => {
    const d = load(), admin = req.user.role === 'Admin';
    const sid = admin ? String(req.query.as || '') : req.user.studentId;
    const s = (d.students || []).find((x) => x.id === sid);
    if (!s) throw new HttpError(admin ? 400 : 403, admin ? 'Choose a learner to view.' : 'Your account isn’t linked to a learner profile. Ask an admin for help.');
    s.wishlist ||= []; s.activeDays ||= []; s.goals ||= { interests: [], level: '', weeklyHours: '' };
    return { d, s };
  };
  const ratings = (d) => {
    const m = new Map();
    for (const v of d.reviews || []) { const r = m.get(v.courseId) || { sum: 0, n: 0 }; r.sum += v.rating; r.n++; m.set(v.courseId, r); }
    return m;
  };
  const instructorFor = (d, c) => {
    const name = (c.instructors || [])[0] || '';
    const inst = d.instructors.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
    return { name, id: inst?.id || '', title: inst ? [inst.product, (inst.platforms || [])[0]].filter(Boolean)[0] || 'Instructor' : 'Instructor' };
  };
  const hoursOf = (c) => +c.hours || Math.round(((c.lessons || []).reduce((a, l) => a + (+l.mins || 0), 0) / 60) * 10) / 10 || (+c.duration ? +c.duration * 8 : 0);
  const card = (d, c, R, s) => {
    const r = R.get(c.id), batches = upcomingBatches(c);
    const next = batches[0] && publicBatch(batches[0]);
    return { id: c.id, code: c.code, name: c.name, platform: c.platform || 'Other', product: c.product, level: LEVEL[c.skill] || 'Beginner', lessons: (c.lessons || []).length, hours: hoursOf(c),
      price: +c.price || 0, rating: r ? Math.round((r.sum / r.n) * 10) / 10 : null, ratings: r ? r.n : 0, instructor: instructorFor(d, c), description: plain(c.description).slice(0, 220),
      learners: (d.enrollments || []).filter((e) => e.courseId === c.id).length, wishlisted: s ? s.wishlist.includes(c.id) : false,
      nextBatch: next || null, batches: batches.length, ...custom(d, c) };
  };
  /** Client versions: who a course was customised for, and the course it was copied from. */
  const custom = (d, c) => {
    const base = c.baseCourse && d.courses.find((x) => x.id === c.baseCourse);
    return { customFor: c.customFor || '', baseCourse: base ? { id: base.id, code: base.code, name: base.name, available: learnerSees(d, base) } : null };
  };
  /** The other published courses in the same family: the original and every client version of it. */
  const family = (d, c) => {
    const root = c.baseCourse || c.id;
    return d.courses.filter((x) => x.id !== c.id && (x.id === root || x.baseCourse === root) && learnerSees(d, x))
      .map((x) => ({ id: x.id, code: x.code, name: x.name, customFor: x.customFor || '' }));
  };
  const published = (d) => d.courses.filter((c) => learnerSees(d, c));
  const progressOf = (e, c) => {
    const total = (c?.lessons || []).length;
    if (e.completed) return 100;
    return total && Array.isArray(e.done) && e.done.length ? Math.round((e.done.filter((id) => c.lessons.some((l) => l.id === id)).length / total) * 100) : e.progress || 0;
  };
  const mine = (d, s, R = ratings(d)) => (d.enrollments || []).filter((e) => e.studentId === s.id).map((e) => {
    const c = d.courses.find((x) => x.id === e.courseId);
    if (!c) return null;
    const by = e.assignedBy && d.instructors.find((i) => i.id === e.assignedBy);
    return { id: e.id, course: card(d, c, R, s), enrolled: e.enrolled, lastActive: e.lastActive, completed: e.completed, progress: progressOf(e, c), source: e.source || (e.amount ? 'purchase' : 'assigned'),
      deadline: e.deadline || '', assignedBy: by?.name || (e.assignedBy === 'admin' ? 'Hazdemy Admin' : ''), payment: e.paymentStatus || '', done: e.done || [] };
  }).filter(Boolean);
  const streak = (s) => {
    const days = new Set(s.activeDays);
    let n = 0, t = Date.now();
    if (!days.has(isoDay(t))) t -= 864e5; // a streak survives until the end of today
    while (days.has(isoDay(t))) { n++; t -= 864e5; }
    return n;
  };
  const learnHours = (d, list) => Math.round(list.reduce((a, e) => {
    const c = d.courses.find((x) => x.id === e.course.id);
    const fromLessons = (c?.lessons || []).filter((l) => e.done.includes(l.id)).reduce((x, l) => x + (+l.mins || 0), 0) / 60;
    return a + (fromLessons || (e.course.hours * e.progress) / 100);
  }, 0) * 10) / 10;
  const categories = (d, R) => {
    const m = new Map(), list = published(d), ids = new Set(list.map((c) => c.id));
    // client versions are counted with their main course, not as courses of their own
    for (const c of list.filter((x) => !(x.baseCourse && ids.has(x.baseCourse)))) m.set(c.platform || 'Other', (m.get(c.platform || 'Other') || 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };
  const recommend = (d, s, R, n, exclude) => {
    const want = new Set((s.goals.interests || []).map((x) => x.toLowerCase())), level = s.goals.level;
    return published(d).filter((c) => !exclude.has(c.id)).map((c) => {
      const k = card(d, c, R, s);
      const score = (want.has(String(c.platform).toLowerCase()) ? 3 : 0) + (level && k.level === level ? 1.5 : 0) + (k.rating || 3.5) * 0.5 + Math.log(k.learners + 1) * 0.3;
      return { ...k, score };
    }).sort((a, b) => b.score - a.score).slice(0, n);
  };
  const touch = (s) => { const t = isoDay(Date.now()); if (!s.activeDays.includes(t)) s.activeDays = [...s.activeDays.slice(-120), t]; };
  const enroll = (d, s, c, extra) => {
    const e = { id: uid('en'), studentId: s.id, courseId: c.id, enrolled: isoDay(Date.now()), progress: 0, completed: '', lastActive: isoDay(Date.now()), amount: 0, done: [], ...extra };
    d.enrollments.push(e); touch(s);
    return e;
  };
  const notifications = (d, s) => {
    const out = [], soon = isoDay(Date.now() + 7 * 864e5), today = isoDay(Date.now());
    for (const e of mine(d, s)) {
      if (e.source === 'assigned' && e.progress === 0 && !e.completed) out.push({ kind: 'assigned', at: new Date(e.enrolled).getTime(), text: `${e.assignedBy || 'Your instructor'} assigned you ${e.course.name}`, link: '/learn/courses/' + e.course.id });
      if (e.deadline && !e.completed && e.deadline <= soon) out.push({ kind: 'deadline', at: new Date(e.deadline).getTime(), text: `${e.course.name} is due ${e.deadline < today ? 'already (overdue)' : e.deadline === today ? 'today' : 'on ' + e.deadline}`, link: '/learn/courses/' + e.course.id });
    }
    for (const t of (d.threads || []).filter((x) => x.studentId === s.id && x.learnerUnread)) {
      const inst = d.instructors.find((i) => i.id === t.instructorId);
      out.push({ kind: 'message', at: t.messages[t.messages.length - 1].at, text: `${inst?.name || 'Your instructor'} replied to you`, link: '/learn/messages?thread=' + t.id });
    }
    for (const v of (d.reviews || []).filter((x) => x.studentId === s.id && x.reply && !x.replySeen)) out.push({ kind: 'review', at: new Date(v.replied || v.date).getTime(), text: 'Your instructor replied to your review', link: '/learn/reviews' });
    // answers to the learner's requests (the last 30 days)
    const what = { batch: 'new batch', change: 'batch change', custom: 'custom version' };
    for (const r of (d.requests || []).filter((x) => x.studentId === s.id && x.status !== 'New' && x.handledAt && Date.now() - new Date(x.handledAt) < 30 * 864e5))
      out.push({ kind: 'request', at: new Date(r.handledAt).getTime(), text: `Your ${what[r.kind] || 'request'} request for ${r.course} was ${r.status.toLowerCase()}${r.reply ? `: ${r.reply}` : ''}`, link: '/learn/courses/' + r.courseId });
    out.push(...announcementsFor(d, 'learners'));
    return out.sort((a, b) => b.at - a.at).slice(0, 12);
  };

  /* ---------- admin: who can be previewed ---------- */
  app.get('/api/learn/learners', wrap((req) => {
    if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can do that.');
    const d = load(), accounts = new Set(d.users.filter((u) => u.role === 'Learner').map((u) => u.studentId));
    return (d.students || []).map((s) => ({ id: s.id, name: s.name, email: s.email, account: accounts.has(s.id), courses: d.enrollments.filter((e) => e.studentId === s.id).length }))
      .sort((a, b) => Number(b.account) - Number(a.account) || b.courses - a.courses || a.name.localeCompare(b.name));
  }));

  /* ---------- dashboard ---------- */
  app.get('/api/learn/summary', wrap((req) => {
    const { d, s } = learner(req);
    return { student: { id: s.id, name: s.name, email: s.email }, enrolled: d.enrollments.filter((e) => e.studentId === s.id).length,
      unread: (d.threads || []).filter((t) => t.studentId === s.id && t.learnerUnread).length, notifications: notifications(d, s), payments: payConfig(d), streak: streak(s) };
  }));
  app.get('/api/learn/overview', wrap((req) => {
    const { d, s } = learner(req), R = ratings(d), list = mine(d, s, R);
    const active = list.filter((e) => !e.completed);
    const current = [...active].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (b.lastActive || '').localeCompare(a.lastActive || ''))[0] || list[0] || null;
    const done = list.filter((e) => e.completed);
    return {
      fresh: !list.length,
      current, enrollments: list,
      stats: { enrolled: list.length, assigned: list.filter((e) => e.source === 'assigned').length, progress: list.length ? Math.round(list.reduce((a, e) => a + e.progress, 0) / list.length) : 0, hours: learnHours(d, list), certificates: done.filter((e) => (d.reviews || []).some((v) => v.studentId === s.id && v.courseId === e.course.id)).length, streak: streak(s) },
      deadlines: active.filter((e) => e.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4).map((e) => ({ id: e.id, courseId: e.course.id, name: e.course.name, deadline: e.deadline })),
      recommendations: recommend(d, s, R, 4, new Set(list.map((e) => e.course.id))),
      categories: categories(d, R).slice(0, 5), goals: s.goals
    };
  }));

  /* ---------- catalog + course page ---------- */
  app.get('/api/learn/catalog', wrap((req) => {
    const { d, s } = learner(req), R = ratings(d), enrolled = new Set(d.enrollments.filter((e) => e.studentId === s.id).map((e) => e.courseId));
    return { courses: published(d).map((c) => ({ ...card(d, c, R, s), enrolled: enrolled.has(c.id) })), categories: categories(d, R) };
  }));
  app.post('/api/learn/recommend', wrap((req) => {
    const { d, s } = learner(req), R = ratings(d);
    const interests = Array.isArray(req.body.interests) ? req.body.interests.map(String).slice(0, 12) : [];
    const level = ['Beginner', 'Intermediate', 'Advanced'].includes(req.body.level) ? req.body.level : '';
    if (req.body.save) { s.goals = { ...s.goals, interests, level, weeklyHours: req.body.weeklyHours ?? s.goals.weeklyHours, goal: String(req.body.goal || s.goals.goal || '').slice(0, 300) }; save(); }
    const enrolled = new Set(d.enrollments.filter((e) => e.studentId === s.id).map((e) => e.courseId));
    return recommend(d, { ...s, goals: { ...s.goals, interests, level } }, R, 8, enrolled);
  }));
  /* ---------- course advisor: what it searches, and the "get details" hand-over ---------- */
  app.get('/api/learn/advisor', wrap((req) => {
    const { d } = learner(req), R = ratings(d);
    return d.courses.filter((c) => c.status && !['Retired', 'Backlog'].includes(c.status)).map((c) => ({
      id: c.id, code: c.code, name: c.name, status: c.status, published: learnerSees(d, c),
      area: c.platform || 'Other', product: c.product || '', portfolio: c.portfolio || '', level: c.skill || 'Foundational',
      days: +c.duration || 0, hours: hoursOf(c), delivery: c.delivery || '', price: c.price || '',
      prereqs: plain(c.prereqs).trim(), audience: plain(c.persona).trim(), certification: plain(c.certification).trim(), labs: plain(c.labConfig).trim(),
      rating: R.has(c.id) ? Math.round((R.get(c.id).sum / R.get(c.id).n) * 10) / 10 : null, learners: (d.enrollments || []).filter((e) => e.courseId === c.id).length
    }));
  }));
  app.post('/api/learn/enquiries', wrap((req) => {
    const { d, s } = learner(req);
    const name = String(req.body.name || '').trim().slice(0, 120), email = String(req.body.email || '').trim().slice(0, 200);
    const errors = {};
    if (!name) errors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length) throw new HttpError(422, 'Fix the highlighted fields.', errors);
    const c = d.courses.find((x) => x.id === String(req.body.courseId || ''));
    const e = { id: uid('eq'), at: new Date().toISOString(), studentId: s.id, name, email, courseId: c?.id || '', course: c ? `${c.code} · ${c.name}` : '',
      subject: String(req.body.subject || '').trim().slice(0, 200) || (c ? `Details request: ${c.code}` : 'Training enquiry'), message: String(req.body.message || '').trim().slice(0, 3000) };
    d.enquiries ||= [];
    d.enquiries.unshift(e);
    d.enquiries = d.enquiries.slice(0, 1000);
    log(`Details request from ${name} (${email})${c ? ` about ${c.code} ${c.name}` : ''}`);
    save();
    return { ok: true, id: e.id };
  }));
  /* ---------- requests: a new batch, or a custom version for a company ---------- */
  // batch: a new batch of the course · change: move my batch to another date or time · custom: a version for my company
  const REQ_KINDS = ['batch', 'change', 'custom'], MODES = ['Virtual', 'In person', 'Hybrid'], TIMES = ['Any time', 'Morning', 'Afternoon', 'Evening'];
  const myRequest = (r) => ({ id: r.id, kind: r.kind, at: r.at, courseId: r.courseId, course: r.course, preferredStart: r.preferredStart, timeZone: r.timeZone, mode: r.mode,
    people: r.people, company: r.company, message: r.message, status: r.status, reply: r.reply || '', handledAt: r.handledAt || '', timeOfDay: r.timeOfDay || '', fromBatch: r.fromBatch || null });
  app.post('/api/learn/requests', wrap((req, res) => {
    const { d, s } = learner(req), b = req.body || {}, f = {};
    const kind = REQ_KINDS.includes(b.kind) ? b.kind : '', c = d.courses.find((x) => x.id === String(b.courseId || ''));
    if (!kind) throw new HttpError(400, 'Choose what you’re asking for.');
    if (!c || !learnerSees(d, c) && !d.enrollments.some((e) => e.studentId === s.id && e.courseId === c.id)) throw new HttpError(404, 'Course not found.');
    const preferredStart = /^\d{4}-\d{2}-\d{2}$/.test(b.preferredStart || '') ? b.preferredStart : '';
    if ((kind === 'batch' || kind === 'change') && !preferredStart) f.preferredStart = 'Choose the date you’d like to start.';
    // a batch change is for a learner on one of the course's batches
    const mine = d.enrollments.find((e) => e.studentId === s.id && e.courseId === c.id), from = kind === 'change' ? batchOf(c, mine, s.email) : null;
    if (kind === 'change' && !from) throw new HttpError(422, 'You aren’t on a batch of this course yet. Choose a batch, or request a new one.');
    if (preferredStart && preferredStart < isoDay(Date.now())) f.preferredStart = 'Choose today or a later date.';
    const company = String(b.company || '').trim().slice(0, 120);
    if (kind === 'custom' && !company) f.company = 'Enter your company or team.';
    const people = Math.max(1, Math.min(1000, Math.round(+b.people || 1)));
    if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
    if ((d.requests || []).some((r) => r.studentId === s.id && r.courseId === c.id && r.kind === kind && r.status === 'New'))
      throw new HttpError(409, `You’ve already asked for ${kind === 'batch' ? 'a batch' : kind === 'change' ? 'a batch change' : 'a custom version'} of this course. We’ll get back to you soon.`);
    const r = { id: uid('rq'), kind, at: new Date().toISOString(), studentId: s.id, name: s.name, email: s.email, courseId: c.id, course: `${c.code} · ${c.name}`,
      preferredStart, timeZone: String(b.timeZone || '').slice(0, 60), mode: MODES.includes(b.mode) ? b.mode : 'Virtual', people, company,
      message: String(b.message || '').trim().slice(0, 2000), status: 'New',
      ...(kind === 'change' ? { timeOfDay: TIMES.includes(b.timeOfDay) ? b.timeOfDay : 'Any time', fromBatch: { id: from.id, startDate: from.startDate, endDate: from.endDate, startTime: from.startTime, endTime: from.endTime, timeZone: from.timeZone } } : {}) };
    (d.requests ||= []).unshift(r);
    log(`${s.name} asked for ${kind === 'batch' ? `a batch of ${c.code} from ${preferredStart}` : kind === 'change' ? `a batch change on ${c.code} (from ${preferredStart})` : `a custom version of ${c.code} for ${company}`}`);
    save(); res.status(201);
    const S = settingsOf(d), to = S.supportEmail || d.users.filter((u) => u.role === 'Admin').map((u) => u.email);
    if (S.emailOn) sendLater({ to, replyTo: s.email, site: S.siteName, subject: `New request: ${kind === 'batch' ? 'a new batch' : kind === 'change' ? 'a batch change' : `a custom version for ${company}`} (${c.code})`,
      text: [`${s.name} (${s.email}) asked for ${kind === 'batch' ? 'a new batch' : kind === 'change' ? 'a batch change' : `a custom version for ${company}`} of ${c.code} ${c.name}.`,
        preferredStart ? `Preferred start: ${preferredStart}` : '', kind !== 'change' ? `People: ${people}` : '', `Delivery: ${r.mode}`, r.message ? `\n“${r.message}”` : '', '', 'Answer it on the Requests page.'].filter(Boolean).join('\n') });
    return myRequest(r);
  }));
  app.get('/api/learn/requests', wrap((req) => {
    const { d, s } = learner(req), course = String(req.query.course || '');
    return (d.requests || []).filter((r) => r.studentId === s.id && (!course || r.courseId === course)).map(myRequest);
  }));
  app.get('/api/learn/courses/:id', wrap((req) => {
    const { d, s } = learner(req), R = ratings(d);
    const c = d.courses.find((x) => x.id === req.params.id);
    const e = d.enrollments.find((x) => x.studentId === s.id && x.courseId === req.params.id);
    if (!c || (!e && !learnerSees(d, c))) throw new HttpError(404, 'Course not found.');
    const reviews = (d.reviews || []).filter((v) => v.courseId === c.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6)
      .map((v) => ({ id: v.id, rating: v.rating, comment: v.comment, instructorRating: v.instructorRating || null, instructorComment: v.instructorComment || '', date: v.date, reply: v.reply || '', student: (d.students.find((x) => x.id === v.studentId)?.name || 'Learner').split(' ')[0] }));
    // booked on a batch: each day's lessons can be marked done from that class day on
    const batch = e && batchOf(c, e, s.email), opens = lessonOpens(c, batch);
    return {
      ...card(d, c, R, s), status: c.status, delivery: c.delivery, duration: c.duration, objectives: c.objectives || '', topics: c.topics || '', prereqs: c.prereqs || '', persona: c.persona || '', fullDescription: c.description || '',
      lessons: (c.lessons || []).map((l) => ({ id: l.id, day: l.day || '', title: l.title, mins: l.mins, opensOn: opens[l.id] || '', ...(e ? { article: l.article || '', video: l.video || '', attachment: l.attachment || '', qa: (l.qa || []).map(({ q, a }) => ({ q, a })) } : { qaCount: (l.qa || []).length }) })),
      enrollment: e ? { id: e.id, progress: progressOf(e, c), done: e.done || [], completed: e.completed, deadline: e.deadline || '', source: e.source || (e.amount ? 'purchase' : 'assigned'), enrolled: e.enrolled, payment: e.paymentStatus || '',
        batch: batch ? { id: batch.id, startDate: batch.startDate, endDate: batch.endDate, timeZone: batch.timeZone, today: todayIn(batch.timeZone) } : null } : null,
      schedule: upcomingBatches(c).map(publicBatch), versions: family(d, c),
      reviews, myReview: (d.reviews || []).find((v) => v.studentId === s.id && v.courseId === c.id) || null
    };
  }));
  app.post('/api/learn/courses/:id/lessons/:lessonId', wrap((req) => {
    const { d, s } = learner(req);
    const c = d.courses.find((x) => x.id === req.params.id), e = d.enrollments.find((x) => x.studentId === s.id && x.courseId === req.params.id);
    if (!c || !e) throw new HttpError(404, 'You aren’t enrolled in this course.');
    if (!(c.lessons || []).some((l) => l.id === req.params.lessonId)) throw new HttpError(404, 'Lesson not found.');
    if (req.body.done !== false) { // a batch lesson can't be marked done before its class day
      const b = batchOf(c, e, s.email), on = lessonOpens(c, b)[req.params.lessonId];
      if (on && on > todayIn(b.timeZone)) throw new HttpError(403, `This lesson is taught on ${new Date(on + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })}. You can mark it complete from then.`);
    }
    const done = new Set(e.done || []);
    if (req.body.done === false) done.delete(req.params.lessonId); else done.add(req.params.lessonId);
    e.done = [...done];
    e.progress = Math.round((e.done.filter((id) => c.lessons.some((l) => l.id === id)).length / c.lessons.length) * 100);
    const finished = e.progress === 100;
    if (finished && !e.completed) { e.completed = isoDay(Date.now()); log(`${s.name} completed ${c.name}`); }
    if (!finished) e.completed = '';
    e.lastActive = isoDay(Date.now()); touch(s); save();
    const hasReview = (d.reviews || []).some((v) => v.studentId === s.id && v.courseId === c.id);
    return { progress: e.progress, done: e.done, completed: e.completed, reviewNeeded: finished && !hasReview, certificate: finished && hasReview ? certNumber(e) : '' };
  }));

  /* ---------- checkout: free, COD (testing) or Razorpay ---------- */
  app.get('/api/learn/payments/config', wrap(() => payConfig(load())));
  const buyable = (d, s, courseId) => {
    const c = d.courses.find((x) => x.id === courseId);
    if (!c || !learnerSees(d, c)) throw new HttpError(404, 'This course isn’t available to buy.');
    if (d.enrollments.some((e) => e.studentId === s.id && e.courseId === c.id)) throw new HttpError(409, 'You’re already enrolled in this course.');
    return c;
  };
  // a course with upcoming batches is booked on one of them: open, not full, not finished
  const chosenBatch = (c, batchId) => {
    const open = upcomingBatches(c);
    if (!open.length) return null;
    const b = (c.schedules || []).find((x) => x.id === String(batchId || ''));
    if (!b) throw new HttpError(422, 'Choose the batch you want to join.');
    if (!open.some((x) => x.id === b.id)) throw new HttpError(422, 'That batch has finished. Choose another one.');
    if (b.status === 'Full' || (b.seats !== '' && b.seats != null && (b.learners || []).length >= +b.seats)) throw new HttpError(409, 'That batch is full. Choose another one.');
    return b;
  };
  const book = (b, s, e) => { if (!b) return; e.batchId = b.id; const m = String(s.email).toLowerCase(); if (!(b.learners ||= []).includes(m)) b.learners.push(m); };
  const onBatch = (b) => (b ? ` (batch starting ${b.startDate})` : '');
  app.post('/api/learn/checkout', wrap(async (req, res) => {
    const { d, s } = learner(req), c = buyable(d, s, String(req.body.courseId || '')), cfg = payConfig(d), price = +c.price || 0;
    const b = chosenBatch(c, req.body.batchId);
    d.payments ||= [];
    if (!price) { const e = enroll(d, s, c, { source: 'purchase' }); book(b, s, e); log(`${s.name} enrolled in ${c.name}${onBatch(b)} (free)`); save(); res.status(201); return { enrolled: true, enrollmentId: e.id }; }
    if (req.body.method === 'cod') {
      if (!cfg.cod) throw new HttpError(400, 'Cash on delivery isn’t available.');
      const pay = { id: uid('pay'), studentId: s.id, courseId: c.id, amount: price, currency: cfg.currency, method: 'cod', status: 'pending', at: new Date().toISOString() };
      const e = enroll(d, s, c, { source: 'purchase', amount: price, paymentId: pay.id, paymentStatus: 'pending' });
      book(b, s, e); pay.enrollmentId = e.id; d.payments.push(pay);
      log(`${s.name} enrolled in ${c.name}${onBatch(b)} (COD, payment pending)`); save(); res.status(201);
      return { enrolled: true, enrollmentId: e.id, payment: pay };
    }
    if (req.body.method !== 'razorpay') throw new HttpError(400, 'Choose a payment method.');
    if (!cfg.razorpay) throw new HttpError(400, 'Online payment isn’t set up yet. Use COD (testing) for now.');
    let order;
    try { order = await createOrder(price, `${c.code}-${s.id}`, { courseId: c.id, studentId: s.id }, cfg.currency); } catch (x) { throw new HttpError(502, x.message); }
    d.payments.push({ id: uid('pay'), studentId: s.id, courseId: c.id, batchId: b?.id || '', amount: price, currency: cfg.currency, method: 'razorpay', status: 'created', orderId: order.id, at: new Date().toISOString() });
    save();
    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: cfg.keyId, course: c.name, name: s.name, email: s.email };
  }));
  app.post('/api/learn/checkout/verify', wrap((req, res) => {
    const { d, s } = learner(req);
    const { orderId, paymentId, signature } = req.body || {};
    const pay = (d.payments || []).find((p) => p.orderId === orderId && p.studentId === s.id);
    if (!pay) throw new HttpError(404, 'Payment not found.');
    if (pay.status === 'paid') return { enrolled: true, enrollmentId: pay.enrollmentId };
    if (!verifySignature(orderId, paymentId, signature)) { pay.status = 'failed'; save(); throw new HttpError(400, 'The payment couldn’t be verified. You haven’t been charged for an enrollment; contact support if money left your account.'); }
    const c = d.courses.find((x) => x.id === pay.courseId);
    let e = d.enrollments.find((x) => x.studentId === s.id && x.courseId === pay.courseId);
    if (!e) { e = enroll(d, s, c, { source: 'purchase', amount: pay.amount, paymentId: pay.id, paymentStatus: 'paid' }); book((c.schedules || []).find((x) => x.id === pay.batchId), s, e); }
    Object.assign(pay, { status: 'paid', paymentId, enrollmentId: e.id, paidAt: new Date().toISOString() });
    log(`${s.name} bought ${c.name} (${pay.currency} ${pay.amount})`); save(); res.status(201);
    return { enrolled: true, enrollmentId: e.id };
  }));

  /* ---------- wishlist ---------- */
  app.post('/api/learn/wishlist/:courseId', wrap((req) => {
    const { d, s } = learner(req);
    if (!d.courses.some((c) => c.id === req.params.courseId)) throw new HttpError(404, 'Course not found.');
    s.wishlist = s.wishlist.includes(req.params.courseId) ? s.wishlist.filter((x) => x !== req.params.courseId) : [...s.wishlist, req.params.courseId];
    save();
    return { wishlist: s.wishlist };
  }));
  app.get('/api/learn/wishlist', wrap((req) => {
    const { d, s } = learner(req), R = ratings(d), enrolled = new Set(d.enrollments.filter((e) => e.studentId === s.id).map((e) => e.courseId));
    return s.wishlist.map((id) => d.courses.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...card(d, c, R, s), enrolled: enrolled.has(c.id), available: learnerSees(d, c) }));
  }));
  app.get('/api/learn/enrollments', wrap((req) => { const { d, s } = learner(req); return mine(d, s); }));

  /* ---------- certificates (unlocked by reviewing the completed course) ---------- */
  const reviewed = (d, s, courseId) => (d.reviews || []).some((v) => v.studentId === s.id && v.courseId === courseId);
  const certs = (d, s) => mine(d, s).filter((e) => e.completed && reviewed(d, s, e.course.id)).map((e) => ({ id: e.id, number: certNumber({ id: e.id, completed: e.completed }), course: e.course.name, code: e.course.code, courseId: e.course.id, completed: e.completed, hours: e.course.hours, instructor: e.course.instructor.name }));
  app.get('/api/learn/certificates', wrap((req) => { const { d, s } = learner(req); return certs(d, s); }));
  app.get('/api/learn/certificates/pending', wrap((req) => {
    const { d, s } = learner(req);
    return mine(d, s).filter((e) => e.completed && !reviewed(d, s, e.course.id)).map((e) => ({ id: e.id, course: e.course.name, code: e.course.code, courseId: e.course.id, completed: e.completed }));
  }));
  app.get('/api/learn/certificates/:id/pdf', (req, res, next) => {
    try {
      const { d, s } = learner(req);
      const c = certs(d, s).find((x) => x.id === req.params.id);
      if (!c) throw new HttpError(404, 'Certificate not found.');
      const name = `Certificate ${c.number} - ${c.course}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
      certificatePdf({ ...c, student: s.name, signers: certSigners(d, c.courseId) }, res);
    } catch (e) { next(e); }
  });

  /* ---------- messages with instructors ---------- */
  const threadOut = (d, t) => { const inst = d.instructors.find((i) => i.id === t.instructorId), c = d.courses.find((x) => x.id === t.courseId); return { id: t.id, instructor: inst?.name || 'Instructor', instructorId: t.instructorId, course: c?.name || '', courseId: t.courseId, messages: t.messages, unread: !!t.learnerUnread, last: t.messages[t.messages.length - 1] }; };
  app.get('/api/learn/messages', wrap((req) => {
    const { d, s } = learner(req);
    return (d.threads || []).filter((t) => t.studentId === s.id).map((t) => threadOut(d, t)).sort((a, b) => b.last.at - a.last.at);
  }));
  app.post('/api/learn/messages', wrap((req, res) => {
    const { d, s } = learner(req), text = String(req.body.text || '').trim();
    const e = d.enrollments.find((x) => x.studentId === s.id && x.courseId === req.body.courseId);
    const c = e && d.courses.find((x) => x.id === e.courseId), inst = c && instructorFor(d, c);
    if (!inst?.id) throw new HttpError(422, 'Choose one of your courses that has an instructor.', { courseId: 'Choose a course.' });
    if (!text) throw new HttpError(422, 'Write a message.', { text: 'Write a message.' });
    let t = d.threads.find((x) => x.instructorId === inst.id && x.studentId === s.id);
    if (!t) { t = { id: uid('th'), instructorId: inst.id, studentId: s.id, courseId: c.id, messages: [] }; d.threads.push(t); }
    t.messages.push({ from: 'student', text: text.slice(0, 4000), at: Date.now() }); t.unread = true; t.learnerUnread = false;
    touch(s); save(); res.status(201);
    return threadOut(d, t);
  }));
  app.post('/api/learn/messages/:id', wrap((req) => {
    const { d, s } = learner(req), text = String(req.body.text || '').trim();
    const t = (d.threads || []).find((x) => x.id === req.params.id && x.studentId === s.id);
    if (!t) throw new HttpError(404, 'Conversation not found.');
    if (!text) throw new HttpError(422, 'Write a message.', { text: 'Write a message.' });
    t.messages.push({ from: 'student', text: text.slice(0, 4000), at: Date.now() }); t.unread = true; t.learnerUnread = false;
    touch(s); save();
    return threadOut(d, t);
  }));
  app.post('/api/learn/messages/:id/read', wrap((req) => {
    const { d, s } = learner(req), t = (d.threads || []).find((x) => x.id === req.params.id && x.studentId === s.id);
    if (t?.learnerUnread) { t.learnerUnread = false; save(); }
    return { ok: true };
  }));

  /* ---------- reviews ---------- */
  app.get('/api/learn/reviews', wrap((req) => {
    const { d, s } = learner(req), list = mine(d, s);
    const reviews = (d.reviews || []).filter((v) => v.studentId === s.id).map((v) => ({ ...v, course: d.courses.find((c) => c.id === v.courseId)?.name || '', instructor: instructorFor(d, d.courses.find((c) => c.id === v.courseId) || {}).name }));
    let seen = false;
    for (const v of d.reviews || []) if (v.studentId === s.id && v.reply && !v.replySeen) { v.replySeen = true; seen = true; }
    if (seen) save();
    return { reviews: reviews.sort((a, b) => (b.date || '').localeCompare(a.date || '')), toReview: list.filter((e) => e.progress > 0 && !reviews.some((v) => v.courseId === e.course.id)).map((e) => ({ courseId: e.course.id, name: e.course.name, progress: e.progress, instructor: instructorFor(d, d.courses.find((c) => c.id === e.course.id) || {}).name })) };
  }));
  app.post('/api/learn/reviews', wrap((req) => {
    const { d, s } = learner(req), rating = Math.round(+req.body.rating), courseId = String(req.body.courseId || '');
    if (!d.enrollments.some((e) => e.studentId === s.id && e.courseId === courseId)) throw new HttpError(422, 'You can only review courses you’re enrolled in.');
    if (!(rating >= 1 && rating <= 5)) throw new HttpError(422, 'Rate the course from 1 to 5 stars.', { rating: 'Rate the course from 1 to 5 stars.' });
    const iRating = Math.round(+req.body.instructorRating);
    if (!(iRating >= 1 && iRating <= 5)) throw new HttpError(422, 'Rate the instructor from 1 to 5 stars.', { instructorRating: 'Rate the instructor from 1 to 5 stars.' });
    const inst = instructorFor(d, d.courses.find((c) => c.id === courseId) || {});
    d.reviews ||= [];
    let v = d.reviews.find((x) => x.studentId === s.id && x.courseId === courseId);
    if (!v) { v = { id: uid('rv'), studentId: s.id, courseId, reply: '' }; d.reviews.push(v); }
    Object.assign(v, { rating, comment: String(req.body.comment || '').trim().slice(0, 2000), instructorRating: iRating, instructorComment: String(req.body.instructorComment || '').trim().slice(0, 2000), instructorId: inst.id, instructorName: inst.name, date: isoDay(Date.now()) });
    touch(s); save();
    return v;
  }));

  /* ---------- profile ---------- */
  app.get('/api/learn/profile', wrap((req) => { const { s } = learner(req); return s; }));
  app.put('/api/learn/profile', wrap((req) => {
    const { d, s } = learner(req), name = String(req.body.name ?? s.name).trim();
    if (!name) throw new HttpError(422, 'Fix the highlighted fields.', { name: 'Name is required.' });
    s.name = name; s.location = String(req.body.location ?? s.location ?? '').trim(); s.bio = String(req.body.bio ?? s.bio ?? '').trim().slice(0, 1000);
    if (req.body.goals) s.goals = { interests: (req.body.goals.interests || []).map(String).slice(0, 12), level: String(req.body.goals.level || ''), weeklyHours: req.body.goals.weeklyHours ?? '', goal: String(req.body.goals.goal || '').slice(0, 300) };
    const u = d.users.find((x) => x.studentId === s.id); if (u) u.name = name;
    save();
    return s;
  }));
}
