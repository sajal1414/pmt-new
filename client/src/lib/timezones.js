// Time zones for course schedules. A batch is set in its own zone ("9:00 AM IST"); these helpers show the same
// moment in any other zone. The maths mirrors server/src/schedule.js.

/** The zones offered when setting up a batch and when converting, in a sensible order. */
export const ZONES = [
  ['Asia/Kolkata', 'India'], ['America/New_York', 'US Eastern'], ['America/Chicago', 'US Central'], ['America/Denver', 'US Mountain'],
  ['America/Los_Angeles', 'US Pacific'], ['America/Toronto', 'Canada Eastern'], ['America/Sao_Paulo', 'Brazil'], ['Europe/London', 'UK'],
  ['Europe/Berlin', 'Central Europe'], ['Africa/Johannesburg', 'South Africa'], ['Asia/Dubai', 'UAE'], ['Asia/Riyadh', 'Saudi Arabia'],
  ['Asia/Singapore', 'Singapore'], ['Asia/Tokyo', 'Japan'], ['Australia/Sydney', 'Australia Eastern'], ['UTC', 'UTC']
];
/** Shown side by side under each batch until someone picks their own set. */
export const DEFAULT_COMPARE = ['Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore'];
// browsers report some zones under old names (Chrome says "Asia/Calcutta" for "Asia/Kolkata"); compare them by what they resolve to
const canon = (tz) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone; } catch { return tz; } };
const ALIASES = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires' };
/** The viewer's zone, under the same name the batches use. */
export const localZone = () => {
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* very old browser */ }
  if (ALIASES[tz]) return ALIASES[tz];
  const c = canon(tz);
  return ZONES.find(([z]) => canon(z) === c)?.[0] || tz;
};
export const zoneName = (tz) => ZONES.find(([z]) => z === tz)?.[1] || tz.split('/').pop().replace(/_/g, ' ');

function offset(tz, ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ms;
}
/** "2026-11-03" + "09:30" in "Asia/Kolkata" → UTC milliseconds. */
export function zonedToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  return wall - offset(tz, wall - offset(tz, wall));
}

const FIXED = { 'Asia/Kolkata': 'IST', 'Asia/Dubai': 'GST', 'Asia/Riyadh': 'AST', 'Asia/Singapore': 'SGT', 'Asia/Tokyo': 'JST', 'Africa/Johannesburg': 'SAST', 'America/Sao_Paulo': 'BRT', UTC: 'UTC' };
/** EST/EDT, GMT/BST, CET/CEST, IST…, or "GMT+8" when a zone has no common short name. */
export function zoneAbbr(tz, ms = Date.now()) {
  if (FIXED[tz]) return FIXED[tz];
  const part = (loc, style) => { try { return new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value || ''; } catch { return ''; } };
  for (const loc of ['en-US', 'en-GB', 'en-AU', 'en-IN']) { const n = part(loc, 'short'); if (n && !/^(GMT|UTC)[+\-−]/.test(n)) return n; }
  return part('en-US', 'shortOffset') || tz;
}
export const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const dayKey = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const timeIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

/** The first class of a batch as UTC start/end (end rolls to the next day for classes past midnight). */
export function batchUtc(b) {
  const start = zonedToUtc(b.startDate, b.startTime, b.timeZone);
  let end = zonedToUtc(b.startDate, b.endTime, b.timeZone);
  if (end <= start) end += 864e5;
  return { start, end };
}
/**
 * The batch's class time seen from `tz`: { times: "11:30 PM – 7:30 AM", abbr: "EST", shift: -1 | 0 | 1 }.
 * `shift` says whether the class starts the day before or after the batch's own date there.
 */
export function timesIn(b, tz) {
  const { start, end } = batchUtc(b);
  const startDay = dayKey(start, tz), own = b.startDate;
  return { times: `${timeIn(start, tz)} – ${timeIn(end, tz)}`, abbr: zoneAbbr(tz, start), shift: startDay < own ? -1 : startDay > own ? 1 : 0, startDay };
}
/** "Tue, Nov 3 – Thu, Nov 5, 2026" from the batch's own dates. */
export function dateRange(b) {
  const f = (s, o) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  if (b.startDate === b.endDate) return f(b.startDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const sameYear = b.startDate.slice(0, 4) === b.endDate.slice(0, 4);
  return `${f(b.startDate, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${f(b.endDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
}
export const shiftLabel = (s) => (s < 0 ? 'previous day' : s > 0 ? 'next day' : '');
