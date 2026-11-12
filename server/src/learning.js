// Learner-side data for the instructor area: students, enrollments, reviews, daily course views,
// message threads and resources. Certificates come from completed enrollments.
// generateSample() fills these with realistic, clearly-marked sample records (sample: true) built from the
// real courses, so every page has something to show until real enrollments are imported.

const DAY = 864e5;
export const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const dayNum = (s) => Math.floor(new Date(s + 'T00:00:00Z').getTime() / DAY);

/** Small deterministic random generator, so the same data produces the same sample. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FIRST = ['Aarav', 'Priya', 'Rahul', 'Sneha', 'Arjun', 'Kavya', 'Rohan', 'Ananya', 'Vikram', 'Isha', 'Karan', 'Meera', 'Aditya', 'Neha', 'Siddharth', 'Pooja', 'Nikhil', 'Divya', 'Varun', 'Riya', 'Sarah', 'Michael', 'Emily', 'David', 'Olivia', 'James', 'Sophia', 'Daniel', 'Emma', 'Lucas', 'Hannah', 'Noah', 'Chloe', 'Liam', 'Grace', 'Ethan', 'Mia', 'Omar', 'Fatima', 'Yusuf', 'Aisha', 'Kenji', 'Yuki', 'Wei', 'Mei', 'Carlos', 'Lucia', 'Mateo', 'Elena', 'Ahmed', 'Layla', 'Tomás', 'Ingrid', 'Lars', 'Anika', 'Felix', 'Zara', 'Kwame', 'Amara', 'Ravi'];
const LAST = ['Sharma', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Mehta', 'Rao', 'Kumar', 'Singh', 'Johnson', 'Brown', 'Williams', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Khan', 'Hassan', 'Tanaka', 'Sato', 'Chen', 'Wang', 'Lopez', 'Martinez', 'Rossi', 'Müller', 'Schmidt', 'Novak', 'Larsen', 'Okafor', 'Mensah', 'Dubois', 'Silva', 'Costa', 'Fernandes', 'Kapoor', 'Joshi', 'Chopra', 'Banerjee', 'Das', 'Pillai', 'Menon', 'Verma', 'Saxena', 'Bhat', 'Kulkarni'];
const PLACES = ['Bengaluru, India', 'Hyderabad, India', 'Pune, India', 'Chennai, India', 'Mumbai, India', 'London, UK', 'New York, USA', 'Austin, USA', 'Toronto, Canada', 'Singapore', 'Dubai, UAE', 'Berlin, Germany', 'Sydney, Australia', 'Tokyo, Japan', 'São Paulo, Brazil', 'Johannesburg, South Africa'];
const COMMENTS = {
  5: ['Very well explained! Great course.', 'Excellent content and teaching style.', 'The labs made everything click. Highly recommended.', 'Best training I have taken this year.', 'Clear, practical and well paced.'],
  4: ['Easy to follow and practical examples.', 'Good depth; a few labs ran long.', 'Solid course, would like more real-world scenarios.', 'Instructor answered every question patiently.'],
  3: ['Useful, but some modules felt rushed.', 'Good overview; the lab environment was slow at times.', 'Decent course, could use updated screenshots.'],
  2: ['Too fast for beginners.', 'Lab setup issues took a lot of time.'],
  1: ['Content did not match the description.']
};
const STUDENT_MSG = ['Hi, I am stuck on the lab in unit 3. Could you share a hint?', 'Will there be a recording of yesterday’s session?', 'Is there a certification exam after this course?', 'Could you recommend extra reading for this module?', 'Thanks for the session today, it was very helpful!', 'The lab environment is not loading for me. Any workaround?', 'Can I get the slides for the last module?'];
const INSTR_MSG = ['Sure, check the pipeline step settings first, then rerun the flow.', 'Yes, the recording will be shared by end of day.', 'Yes, I will send the exam details shortly.', 'I have added two links to the course resources.', 'Glad it helped! See you in the next session.', 'Please try clearing the cache; I have also raised a ticket.'];

const pick = (r, a) => a[Math.floor(r() * a.length)];
const PUBLISHED = ['Available', 'Published'], REVIEW = ['For Review'], ARCHIVED = ['Retired'];
export const statusTab = (s) => (PUBLISHED.includes(s) ? 'published' : REVIEW.includes(s) ? 'review' : ARCHIVED.includes(s) ? 'archived' : 'drafts');

/** Fill students / enrollments / reviews / views / threads with sample records for the current courses. */
export function generateSample(d, today = Date.now()) {
  const r = rng(20261023);
  const todayN = Math.floor(today / DAY);
  d.students ||= []; d.enrollments ||= []; d.reviews ||= []; d.threads ||= []; d.resources ||= []; d.views ||= {};
  let n = 0;
  const id = (p) => `${p}s${++n}`;
  // students
  const students = [];
  for (let k = 0; students.length < 320 && k < 3000; k++) {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    if (students.some((s) => s.name === name)) continue;
    const email = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com';
    students.push({ id: id('st'), name, email, location: pick(r, PLACES), joined: isoDay((todayN - 30 - Math.floor(r() * 500)) * DAY), sample: true });
  }
  d.students.push(...students);
  // enrollments, reviews and views per taught course
  for (const c of d.courses) {
    if (!(c.instructors || []).length) continue;
    if (c.price === '' || c.price == null) c.price = pick(r, [149, 199, 249, 299, 349, 399, 499]);
    const tab = statusTab(c.status);
    const count = tab === 'published' ? 6 + Math.floor(r() * 55) : tab === 'archived' ? Math.floor(r() * 12) : tab === 'review' ? Math.floor(r() * 4) : 0;
    const taken = new Set();
    for (let k = 0; k < count; k++) {
      const s = pick(r, students);
      if (taken.has(s.id)) continue;
      taken.add(s.id);
      const enrolledN = todayN - Math.floor(Math.pow(r(), 0.8) * 360) - (tab === 'archived' ? 200 : 0);
      const age = todayN - enrolledN;
      // a learner only finishes if the completion date has already happened (no piling up on "today")
      const finishN = enrolledN + 5 + Math.floor(r() * 50);
      const done = age > 7 && r() < 0.48 && finishN <= todayN;
      const completedN = done ? finishN : null;
      const e = { id: id('en'), studentId: s.id, courseId: c.id, enrolled: isoDay(enrolledN * DAY), progress: done ? 100 : Math.min(95, Math.floor(r() * (age < 14 ? 40 : 96))), completed: done ? isoDay(completedN * DAY) : '', lastActive: isoDay((done ? completedN : Math.min(todayN, enrolledN + Math.floor(r() * Math.max(1, age)))) * DAY), amount: +c.price, sample: true };
      d.enrollments.push(e);
      if ((done && r() < 0.55) || (!done && e.progress > 50 && r() < 0.15)) {
        const roll = r(), rating = roll < 0.45 ? 5 : roll < 0.8 ? 4 : roll < 0.93 ? 3 : roll < 0.98 ? 2 : 1;
        d.reviews.push({ id: id('rv'), studentId: s.id, courseId: c.id, rating, comment: pick(r, COMMENTS[rating]), date: done ? e.completed : e.lastActive, reply: '', sample: true });
      }
    }
    if (taken.size) {
      const start = todayN - 179, base = 4 + taken.size * 0.9, counts = [];
      for (let k = 0; k < 180; k++) {
        const wd = new Date((start + k) * DAY).getUTCDay(), weekend = wd === 0 || wd === 6 ? 0.55 : 1;
        counts.push(Math.max(0, Math.round(base * weekend * (0.75 + k / 180 * 0.6) * (0.6 + r() * 0.8))));
      }
      d.views[c.id] = { start: isoDay(start * DAY), counts, sample: true };
    }
  }
  // a few message threads per instructor, with students from their own courses
  for (const inst of d.instructors) {
    const mine = new Set(teachingCourses(d, inst).map((c) => c.id));
    const learners = [...new Set(d.enrollments.filter((e) => mine.has(e.courseId)).map((e) => e.studentId))];
    for (let k = 0; k < Math.min(6, learners.length); k++) {
      const sid = learners[Math.floor(r() * learners.length)];
      if (d.threads.some((t) => t.instructorId === inst.id && t.studentId === sid)) continue;
      const enr = d.enrollments.find((e) => e.studentId === sid && mine.has(e.courseId));
      const startT = today - Math.floor(r() * 20 * DAY) - Math.floor(r() * DAY);
      const msgs = [{ from: 'student', text: pick(r, STUDENT_MSG), at: startT }];
      if (r() < 0.6) msgs.push({ from: 'instructor', text: pick(r, INSTR_MSG), at: startT + Math.floor(r() * 6 * 36e5) });
      if (r() < 0.35) msgs.push({ from: 'student', text: 'Thank you!', at: msgs[msgs.length - 1].at + 36e5 });
      d.threads.push({ id: id('th'), instructorId: inst.id, studentId: sid, courseId: enr?.courseId || '', messages: msgs, unread: msgs[msgs.length - 1].from === 'student', sample: true });
    }
  }
  d.sampleLearning = true;
}

/** Remove every sample learner record (real imported ones stay). */
export function clearSample(d) {
  const before = (d.enrollments || []).length;
  for (const k of ['students', 'enrollments', 'reviews', 'threads', 'resources']) d[k] = (d[k] || []).filter((x) => !x.sample);
  for (const [cid, v] of Object.entries(d.views || {})) if (v.sample) delete d.views[cid];
  d.sampleLearning = false;
  return before - d.enrollments.length;
}

export const ensureLearning = (d) => { for (const k of ['students', 'enrollments', 'reviews', 'threads', 'resources']) d[k] ||= []; d.views ||= {}; };

/** Courses an instructor teaches (courses list instructors by name). */
/* Course authors. An instructor authors a course when their "Course Author" list (instructor.canTeach, course codes or
   names) names it, or when the course's own author text (course.author, e.g. from an import) is their name or email.
   Worked out on read, so nothing is migrated; it's stored only when someone edits it. */
const low = (s) => String(s || '').trim().toLowerCase();
const tokens = (s) => String(s || '').split(/[,;\n]/).map(low).filter(Boolean);
const namesCourse = (t, c) => t === low(c.code) || t === low(c.name);
export const listsCourse = (inst, c) => tokens(inst.canTeach).some((t) => namesCourse(t, c));
// a person's name for matching: lower case, no dots or dashes, no middle initials ("Megan A. Irvine" = "Megan Irvine")
const nameKey = (s) => low(s).replace(/[^a-z0-9@ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 1).join(' ');
export const textIs = (inst, c) => !!low(c.author) && (nameKey(c.author) === nameKey(inst.name) || (!!low(inst.email) && low(c.author) === low(inst.email)));
export const isAuthor = (inst, c) => listsCourse(inst, c) || textIs(inst, c);
/** { names: instructors who author course `c`, text: its author text when that's nobody in the instructor list } */
export function authorsOf(d, c) {
  const names = d.instructors.filter((i) => isAuthor(i, c)).map((i) => i.name);
  const text = c.author && !d.instructors.some((i) => textIs(i, c)) ? String(c.author) : '';
  return { names, text };
}
export const authoredCourses = (d, inst) => d.courses.filter((c) => isAuthor(inst, c));
/** On the instructor's "Qualified to teach" list (added by hand; teaching a course also counts, see the callers). */
export const listsQualified = (inst, c) => tokens(inst.qualified).some((t) => namesCourse(t, c));
export const qualifiedCourses = (d, inst) => d.courses.filter((c) => listsQualified(inst, c));
export const teachingCourses = (d, inst) => d.courses.filter((c) => (c.instructors || []).some((n) => n.trim().toLowerCase() === inst.name.trim().toLowerCase()));
const pct = (now, before) => (before ? Math.round(((now - before) / before) * 1000) / 10 : now ? 100 : 0);

export function range(q) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : isoDay(Date.now());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') && q.from <= to ? q.from : isoDay(dayNum(to) * DAY - 29 * DAY);
  const len = dayNum(to) - dayNum(from) + 1;
  return { from, to, len, prevFrom: isoDay((dayNum(from) - len) * DAY), prevTo: isoDay((dayNum(from) - 1) * DAY) };
}
const within = (s, a, b) => s && s >= a && s <= b;

/** Everything the instructor area computes from the learner records, scoped to one instructor. */
const filled = (v) => !!String(v || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();

export function scope(d, inst) {
  const courses = teachingCourses(d, inst);
  const byId = new Map(courses.map((c) => [c.id, c]));
  const enr = d.enrollments.filter((e) => byId.has(e.courseId));
  const reviews = d.reviews.filter((v) => byId.has(v.courseId));
  const students = new Map(d.students.map((s) => [s.id, s]));
  const viewsOn = (a, b) => {
    let sum = 0;
    for (const c of courses) {
      const v = d.views[c.id]; if (!v) continue;
      const s = dayNum(v.start), lo = Math.max(dayNum(a) - s, 0), hi = Math.min(dayNum(b) - s, v.counts.length - 1);
      for (let k = lo; k <= hi; k++) sum += v.counts[k];
    }
    return sum;
  };
  const courseStats = (c) => {
    const ce = enr.filter((e) => e.courseId === c.id), cr = reviews.filter((v) => v.courseId === c.id);
    return {
      id: c.id, code: c.code, name: c.name, customFor: c.customFor || '', baseCourse: c.baseCourse || '', status: c.status, tab: statusTab(c.status), platform: c.platform, product: c.product, price: c.price ?? '',
      lessons: (c.lessons || []).length, updated: c.updated || c.created || '', students: new Set(ce.map((e) => e.studentId)).size,
      // what the course content has so far (My Courses shows complete / not complete)
      content: { description: filled(c.description), topics: filled(c.topics), objectives: filled(c.objectives), lessons: (c.lessons || []).length > 0, outline: !!c.outline },
      completions: ce.filter((e) => e.completed).length, rating: cr.length ? Math.round((cr.reduce((a, v) => a + v.rating, 0) / cr.length) * 10) / 10 : null, ratings: cr.length,
      views: d.views[c.id] ? d.views[c.id].counts.reduce((a, b) => a + b, 0) : 0
    };
  };
  return { courses, byId, enr, reviews, students, viewsOn, courseStats };
}

export function overview(d, inst, q) {
  const R = range(q), S = scope(d, inst);
  const uniq = (list) => new Set(list.map((e) => e.studentId)).size;
  const upTo = (day) => S.enr.filter((e) => e.enrolled <= day);
  const inR = (field, a, b) => S.enr.filter((e) => within(e[field], a, b));
  const kpi = (value, before, kind) => ({ value, change: pct(value, before), kind });
  const studentsNow = uniq(upTo(R.to)), studentsBefore = uniq(upTo(R.prevTo));
  const series = [];
  for (let k = 0; k < R.len; k++) {
    const day = isoDay((dayNum(R.from) + k) * DAY);
    series.push({ day, views: S.viewsOn(day, day), enrollments: S.enr.filter((e) => e.enrolled === day).length, completions: S.enr.filter((e) => e.completed === day).length });
  }
  return {
    range: R,
    kpis: {
      students: kpi(studentsNow, studentsBefore, 'growth'),
      enrollments: kpi(upTo(R.to).length, upTo(R.prevTo).length, 'growth'),
      views: kpi(S.viewsOn(R.from, R.to), S.viewsOn(R.prevFrom, R.prevTo), 'period')
    },
    series,
    courses: S.courses.map(S.courseStats),
    reviews: latestReviews(d, S, 3),
    activity: activityFeed(d, S, 6)
  };
}

export function latestReviews(d, S, limit) {
  return [...S.reviews].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit).map((v) => reviewOut(v, S));
}
export const reviewOut = (v, S) => ({ ...v, student: S.students.get(v.studentId)?.name || 'Learner', course: S.byId.get(v.courseId)?.name || '', code: S.byId.get(v.courseId)?.code || '' });

export function activityFeed(d, S, limit) {
  const ev = [];
  for (const e of S.enr) {
    const who = S.students.get(e.studentId)?.name || 'A learner', c = S.byId.get(e.courseId);
    ev.push({ kind: 'enrollment', date: e.enrolled, title: 'New enrollment', text: `${who} joined ${c.name}` });
    if (e.completed) ev.push({ kind: 'completion', date: e.completed, title: 'Course completed', text: `${who} completed ${c.name}` });
  }
  for (const v of S.reviews) ev.push({ kind: 'review', date: v.date, title: 'New review', text: `${S.students.get(v.studentId)?.name || 'A learner'} left a ${v.rating}-star review` });
  const order = { enrollment: 0, review: 1, completion: 2 };
  return ev.sort((a, b) => b.date.localeCompare(a.date) || order[a.kind] - order[b.kind]).slice(0, limit);
}

export function studentsOf(d, inst) {
  const S = scope(d, inst), map = new Map();
  for (const e of S.enr) {
    const s = S.students.get(e.studentId); if (!s) continue;
    const row = map.get(s.id) || { ...s, enrollments: [] };
    const c = S.byId.get(e.courseId);
    row.enrollments.push({ id: e.id, courseId: c.id, code: c.code, course: c.name, enrolled: e.enrolled, progress: e.progress, completed: e.completed, lastActive: e.lastActive });
    map.set(s.id, row);
  }
  return [...map.values()].map((s) => {
    const ens = s.enrollments.sort((a, b) => b.enrolled.localeCompare(a.enrolled));
    return { id: s.id, name: s.name, email: s.email, location: s.location, enrollments: ens, courses: ens.length, completed: ens.filter((e) => e.completed).length,
      progress: Math.round(ens.reduce((a, e) => a + e.progress, 0) / ens.length), firstEnrolled: ens[ens.length - 1].enrolled, lastActive: ens.reduce((a, e) => (e.lastActive > a ? e.lastActive : a), ''),
      reviews: S.reviews.filter((v) => v.studentId === s.id).map((v) => reviewOut(v, S)) };
  });
}

export function analytics(d, inst, q) {
  const R = range(q), S = scope(d, inst), ov = overview(d, inst, q);
  const rows = S.courses.map((c) => {
    const ce = S.enr.filter((e) => e.courseId === c.id), inPeriod = ce.filter((e) => within(e.enrolled, R.from, R.to));
    const st = S.courseStats(c);
    return { ...st, periodViews: viewsFor(d, c.id, R.from, R.to), periodEnrollments: inPeriod.length,
      periodCompletions: ce.filter((e) => within(e.completed, R.from, R.to)).length, completionRate: ce.length ? Math.round((ce.filter((e) => e.completed).length / ce.length) * 100) : 0 };
  });
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: S.reviews.filter((v) => v.rating === star).length }));
  const all = S.enr.length, started = S.enr.filter((e) => e.progress > 0).length, half = S.enr.filter((e) => e.progress >= 50).length, done = S.enr.filter((e) => e.completed).length;
  return { range: R, kpis: ov.kpis, series: ov.series, rows, ratings: dist, avgRating: S.reviews.length ? Math.round((S.reviews.reduce((a, v) => a + v.rating, 0) / S.reviews.length) * 10) / 10 : null,
    funnel: [{ label: 'Enrolled', count: all }, { label: 'Started', count: started }, { label: 'Halfway', count: half }, { label: 'Completed', count: done }] };
}
const viewsFor = (d, cid, a, b) => { const v = d.views[cid]; if (!v) return 0; const s = dayNum(v.start); let sum = 0; for (let k = Math.max(dayNum(a) - s, 0); k <= Math.min(dayNum(b) - s, v.counts.length - 1); k++) sum += v.counts[k]; return sum; };

export function certificatesOf(d, inst) {
  const S = scope(d, inst);
  return S.enr.filter((e) => e.completed).map((e) => {
    const c = S.byId.get(e.courseId), s = S.students.get(e.studentId);
    return { id: e.id, number: certNumber(e), student: s?.name || 'Learner', email: s?.email || '', courseId: c.id, code: c.code, course: c.name, completed: e.completed, hours: c.hours || '' };
  }).sort((a, b) => b.completed.localeCompare(a.completed));
}
export const certNumber = (e) => `ATL-${e.completed.slice(0, 4)}-${e.id.replace(/[^a-z0-9]/gi, '').toUpperCase().padStart(6, '0')}`;

/** Who signs a course's certificate: its instructors (up to four), with the signature each saved on their profile. */
export function certSigners(d, courseId) {
  const c = d.courses.find((x) => x.id === courseId);
  return (c?.instructors || []).map((n) => n.trim()).filter(Boolean).slice(0, 4).map((name) => {
    const inst = d.instructors.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
    return { name: inst?.name || name, title: 'Instructor', signature: inst?.signature || '' };
  });
}
