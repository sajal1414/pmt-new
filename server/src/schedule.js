// Course schedules: the dates and class times of each batch, set in the time zone the batch is run in.
// Times are stored as local wall-clock times plus an IANA zone, so "9:00 AM IST" stays 9:00 AM IST across
// daylight-saving changes elsewhere; the UTC moment is worked out from them when needed.
export const SCHEDULE_STATUSES = ['Open', 'Few seats left', 'Full', 'Cancelled'];
export const SCHEDULE_MODES = ['Virtual', 'In person', 'Hybrid'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The learners' emails on a batch: a list or text split on commas, spaces or new lines; tidied, without repeats. */
export const batchEmails = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map((x) => String(x).trim().replace(/^mailto:/i, '').toLowerCase()).filter(Boolean))];
/** A batch as learners and websites see it: no internal notes, no learner list. */
export const publicBatch = ({ notes, learners, auto, ...b }) => ({ ...b, booked: (learners || []).length });
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const validZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return !!tz; } catch { return false; } };
/** How far `tz` is ahead of UTC at the moment `ms`, in milliseconds. */
function offset(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}
/** "2026-11-03" + "09:30" in "Asia/Kolkata" → the UTC moment in milliseconds. */
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const first = wall - offset(tz, wall);
  return wall - offset(tz, first); // second pass settles days when the clocks change
}

/** A weekday batch of up to 5 class days that still has a Saturday or Sunday inside it (longer courses can't avoid one). */
export function overWeekend(start, end) {
  let weekdays = 0, weekend = false;
  for (let x = start; x <= end && weekdays <= 5; ) {
    const d = new Date(x + 'T12:00:00Z'), w = d.getUTCDay();
    if (w === 0 || w === 6) weekend = true; else weekdays++;
    d.setUTCDate(d.getUTCDate() + 1); x = d.toISOString().slice(0, 10);
  }
  return weekend && weekdays <= 5;
}

/** Checks and tidies the batches sent with a course. Problems are added to `errors.schedules`. */
export function cleanSchedules(list, uid, errors) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.slice(0, 100).forEach((s, i) => {
    const n = `Batch ${i + 1}`;
    const b = {
      id: String(s.id || '').startsWith('new-') || !s.id ? uid('sch') : String(s.id),
      startDate: String(s.startDate || '').trim(), endDate: String(s.endDate || s.startDate || '').trim(),
      startTime: String(s.startTime || '').trim(), endTime: String(s.endTime || '').trim(), timeZone: String(s.timeZone || '').trim(),
      days: String(s.days || '').trim().slice(0, 60), mode: SCHEDULE_MODES.includes(s.mode) ? s.mode : 'Virtual',
      location: String(s.location || '').trim().slice(0, 200), instructor: String(s.instructor || '').trim().slice(0, 120),
      seats: s.seats === '' || s.seats == null ? '' : Math.max(0, Math.round(+s.seats) || 0),
      status: SCHEDULE_STATUSES.includes(s.status) ? s.status : 'Open', notes: String(s.notes || '').trim().slice(0, 1000),
      learners: batchEmails(s.learners).slice(0, 1000), ...(s.auto ? { auto: true } : {})
    };
    const badEmail = b.learners.find((x) => !EMAIL.test(x));
    let bad = '';
    if (!DATE.test(b.startDate)) bad = 'choose a start date';
    else if (!DATE.test(b.endDate) || b.endDate < b.startDate) bad = 'the end date must be on or after the start date';
    else if (!TIME.test(b.startTime) || !TIME.test(b.endTime)) bad = 'enter start and end times';
    else if (b.startTime === b.endTime) bad = 'the end time must differ from the start time';
    else if (!validZone(b.timeZone)) bad = 'choose a time zone';
    else if (!/sat|sun|weekend/i.test(b.days) && [b.startDate, b.endDate].some((x) => [0, 6].includes(new Date(x + 'T12:00:00Z').getUTCDay()))) bad = 'it starts or ends on a Saturday or Sunday: choose weekdays, or put Sat or Sun in Class days for a weekend batch';
    else if (!/sat|sun|weekend/i.test(b.days) && overWeekend(b.startDate, b.endDate)) bad = 'it runs over a Saturday and Sunday: start it earlier in the week so it ends by Friday';
    else if (badEmail) bad = `“${badEmail}” isn’t an email address`;
    if (bad && !errors.schedules) errors.schedules = `${n}: ${bad}.`;
    out.push(b);
  });
  return out.sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
}

/** A batch with its first class as UTC moments: what other time zones are worked out from. */
export function withUtc(b) {
  const startUtc = zonedToUtc(b.startDate, b.startTime, b.timeZone);
  let endUtc = zonedToUtc(b.startDate, b.endTime, b.timeZone);
  if (endUtc <= startUtc) endUtc += 864e5; // class runs past midnight
  return { ...b, startUtc: new Date(startUtc).toISOString(), endUtc: new Date(endUtc).toISOString() };
}
/** Batches that haven't finished yet and aren't cancelled, soonest first. */
export const upcomingBatches = (c, today = new Date().toISOString().slice(0, 10)) =>
  (c.schedules || []).filter((b) => b.status !== 'Cancelled' && b.endDate >= today).map(withUtc).sort((a, b) => a.startUtc.localeCompare(b.startUtc));

const FIXED = { 'Asia/Kolkata': 'IST', 'Asia/Dubai': 'GST', 'Asia/Riyadh': 'AST', 'Asia/Singapore': 'SGT', 'Asia/Tokyo': 'JST', 'Africa/Johannesburg': 'SAST', 'America/Sao_Paulo': 'BRT', UTC: 'UTC' };
/** Short zone name at a moment: EST/EDT, GMT/BST, CET/CEST, AEST/AEDT, IST…; "GMT+3" when there's no common one. */
export function zoneAbbr(tz, ms = Date.now()) {
  if (FIXED[tz]) return FIXED[tz];
  for (const loc of ['en-US', 'en-GB', 'en-AU', 'en-IN']) {
    const n = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || '';
    if (n && !/^(GMT|UTC)[+-−]/.test(n)) return n;
  }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || tz;
}
/** "09:30" → "9:30 AM" */
export const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
/** "9:00 AM – 5:00 PM IST", in the batch's own time zone. */
export const batchTimes = (b) => `${clock(b.startTime)} – ${clock(b.endTime)} ${zoneAbbr(b.timeZone, zonedToUtc(b.startDate, b.startTime, b.timeZone))}`;

/** Today's date (YYYY-MM-DD) in the time zone `tz`. */
export const todayIn = (tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const nextDay = (s) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** The batch a learner is booked on for course `c`: the one they were enrolled from, or one that lists their email. */
export const batchOf = (c, e, email = '') => (c.schedules || []).find((b) => b.id === e?.batchId) || (c.schedules || []).find((b) => (b.learners || []).includes(String(email).toLowerCase()));
/**
 * The date each lesson can be marked done in batch `b`: Day 1's lessons on the first class day, Day 2's on the
 * second, and so on (Saturdays and Sundays skipped unless it's a weekend batch). Lessons without a day open on day 1.
 */
export function lessonOpens(c, b) {
  if (!b || !DATE.test(b.startDate)) return {};
  const end = DATE.test(b.endDate) && b.endDate >= b.startDate ? b.endDate : b.startDate;
  const weekendOnly = /sat|sun|weekend/i.test(b.days || '') && !/mon|tue|wed|thu|fri/i.test(b.days || '');
  const weekend = /sat|sun|weekend/i.test(b.days || '');
  const days = [];
  for (let x = b.startDate; x <= end && days.length < 400; x = nextDay(x)) {
    const wd = new Date(x + 'T12:00:00Z').getUTCDay(), sat = wd === 0 || wd === 6;
    if (weekendOnly ? sat : weekend || !sat) days.push(x);
  }
  if (!days.length) days.push(b.startDate);
  const order = [...new Set((c.lessons || []).map((l) => l.day).filter(Boolean))];
  return Object.fromEntries((c.lessons || []).map((l) => [l.id, days[Math.min(l.day ? order.indexOf(l.day) : 0, days.length - 1)]]));
}

/**
 * Sample batches for the courses whose status is in `statuses`, from `from` to `to` (YYYY-MM-DD): about one batch a
 * month per course, Monday to Friday, none over Christmas / New Year, and no instructor on two batches the same day
 * (batches already scheduled count too). Batches are tagged `auto` so they can be removed again.
 * Returns { added, courses, short: codes that got fewer batches because their instructors were busy }.
 */
export function autoSchedule(d, { from, to, statuses, timeZone = 'America/New_York' }, uid) {
  const add = (s, n) => { const t = new Date(s + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const weekday = (s) => ![0, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay());
  const off = (s) => s.slice(5) >= '12-24' || s.slice(5) <= '01-01'; // Christmas to New Year
  const classDays = (start, n) => { const out = []; for (let x = start; out.length < n; x = add(x, 1)) if (weekday(x)) out.push(x); return out; };
  const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
  const key = (n) => String(n || '').trim().toLowerCase();
  const busy = new Map();
  const mark = (n, dates) => { if (!key(n)) return; const s = busy.get(key(n)) || new Set(); dates.forEach((x) => s.add(x)); busy.set(key(n), s); };
  const free = (n, dates) => !dates.some((x) => busy.get(key(n))?.has(x));
  for (const c of d.courses) for (const b of c.schedules || []) {
    const dates = []; for (let x = b.startDate; x <= (b.endDate || b.startDate) && dates.length < 400; x = add(x, 1)) dates.push(x);
    mark(b.instructor, dates);
  }
  // about one batch a month: the range split into month-long windows
  const span = Math.round((new Date(to) - new Date(from)) / 864e5) + 1, n = Math.max(1, Math.round(span / 30));
  const windows = Array.from({ length: n }, (_, i) => [Math.floor((i * span) / n), Math.floor(((i + 1) * span) / n) - 1]);
  const pick = d.courses.filter((c) => statuses.includes(c.status));
  // courses with the fewest instructors first: they have the least room
  const order = shuffle(pick).sort((a, b) => ((a.instructors || []).length || 99) - ((b.instructors || []).length || 99));
  let added = 0;
  const made = new Map(order.map((c) => [c.id, []])); // the dates of each course's new batches
  // one batch: the first start in `[a, z]` (days after `from`) that fits the week and has a free instructor
  const place = (c, a, z) => {
    const days = Math.max(1, Math.ceil(+c.duration || 1));
    const perDay = +c.hours && +c.duration ? +c.hours / +c.duration : 8;
    const [startTime, endTime] = perDay <= 5.5 ? ['09:00', '14:00'] : ['09:00', '17:00'];
    // a batch fits in one week: 3- and 4-day courses start on Monday or Tuesday, 5 days and longer on Monday,
    // and 1- or 2-day courses on any weekday that leaves room before the weekend
    const startDays = days >= 5 ? [1] : days >= 3 ? [1, 2] : [1, 2, 3, 4, 5].filter((w) => w + days - 1 <= 5);
    const mine = made.get(c.id), team = shuffle(c.instructors || []);
    const starts = shuffle(Array.from({ length: z - a + 1 }, (_, i) => add(from, a + i)).filter((x) => startDays.includes(new Date(x + 'T12:00:00Z').getUTCDay())));
    for (const s of starts) {
      const dates = classDays(s, days);
      if (dates[dates.length - 1] > to || dates.some(off)) continue;
      if (mine.some((m) => Math.abs(new Date(m) - new Date(s)) < 14 * 864e5)) continue; // a course's batches at least two weeks apart
      const who = team.length ? team.find((t) => free(t, dates)) : '';
      if (team.length && !who) continue;
      mark(who, dates); mine.push(s);
      const inPerson = timeZone === 'Asia/Kolkata' && Math.random() < 0.25; // the classroom is in Chennai
      (c.schedules ||= []).push({ id: uid('sch'), startDate: s, endDate: dates[dates.length - 1], startTime, endTime, timeZone, days: 'Mon–Fri',
        mode: inPerson ? 'In person' : 'Virtual', location: inPerson ? 'Hazdemy Chennai, Thoraipakkam' : 'Microsoft Teams', instructor: who,
        seats: c.maxStudents || 15, status: 'Open', notes: 'Added by Auto-schedule', learners: [], auto: true });
      added++;
      return true;
    }
    return false;
  };
  // round by round, so every course gets its first batch before any course gets a second: in that round's month,
  // or else anywhere in the range
  windows.forEach(([a, z]) => { for (const c of order) if (!place(c, a, z)) place(c, 0, span - 1); });
  for (const c of order) c.schedules?.sort((x, y) => (x.startDate + x.startTime).localeCompare(y.startDate + y.startTime));
  const short = order.filter((c) => made.get(c.id).length < windows.length).map((c) => c.code);
  return { added, courses: pick.length, short };
}
