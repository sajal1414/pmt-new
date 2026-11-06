// Shared vocabularies, taken from the live Hazdemy app.
export const STATUSES = ['Available', 'In Development', 'Backlog', 'Pipeline', 'Draft', 'In Progress', 'For Review', 'Updated Version', 'Custom', 'Published', 'Lockheed', 'Retired'];
export const OUTLINE = ['Missing', 'Not Yet Scoped', 'Draft', 'Partially Complete', 'Validated'];
export const SKILLS = ['Foundational', 'Intermediate', 'Advanced'];
export const LABLOC = ['ITZ', 'Hazdemy', 'Instructor owned', 'N/A'];
export const IPOWN = ['Hazdemy', 'SubK'];
export const TRAVEL = ['Can Travel', 'Virtual Only', 'In Person Only', 'Both'];
export const ROLES = ['Admin', 'Instructor', 'Learner'];

export const COURSE_FIELDS = ['code', 'ibmCode', 'pmt', 'name', 'status', 'vendor', 'platform', 'portfolio', 'product', 'instructors', 'delivery', 'duration', 'hours', 'outlineStatus', 'outline', 'description', 'objectives', 'topics', 'skill', 'maxStudents', 'prereqs', 'persona', 'labConfig', 'deliveryNotes', 'labLocation', 'ipOwner', 'author', 'planned', 'release', 'retire', 'ibmRetire', 'dailyRate', 'materialsCost', 'labCost', 'price', 'learningPath', 'badge', 'certification', 'recordSource', 'notes', 'lessons', 'schedules', 'customFor', 'baseCourse', 'extra', 'created'];
export const INSTRUCTOR_FIELDS = ['name', 'email', 'phone', 'location', 'travel', 'vendor', 'platforms', 'portfolio', 'product', 'skills', 'canTeach', 'languages', 'rating', 'comments', 'extra'];

export const today = () => new Date().toISOString().slice(0, 10);
export const uniq = (a) => [...new Set(a.filter((x) => x != null && x !== ''))];
export const splitList = (s) => uniq(String(s ?? '').split(/[,;|\n]/).map((x) => x.trim()));
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Phone numbers: digits with optional +, spaces, dashes, dots or brackets; 7 to 15 digits. */
export const phoneOk = (v) => !v || (/^\+?[\d\s().-]+$/.test(v) && (v.match(/\d/g) || []).length >= 7 && (v.match(/\d/g) || []).length <= 15);
export const PHONE_MSG = 'Enter a phone number like +91 98765 43210.';

export function blankCourse(o = {}) {
  const c = {};
  for (const k of COURSE_FIELDS) c[k] = k === 'instructors' || k === 'lessons' || k === 'schedules' ? [] : '';
  c.status = 'Available';
  c.delivery = 'ILT';
  c.created = today();
  return Object.assign(c, o);
}

/**
 * Fields an admin added, for example from a new spreadsheet column: { key: 'cf_lab_vendor', label: 'Lab Vendor' }.
 * Their values live in each record's `extra` object under the key.
 */
export const customKey = (label) => 'cf_' + String(label).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
export const customFieldsOf = (d, kind) => ((d.customFields ||= { courses: [], instructors: [] })[kind] ||= []);
/** Keeps only known extra fields, as trimmed text. */
export const cleanExtra = (extra, fields) => Object.fromEntries(fields.map((f) => [f.key, String(extra?.[f.key] ?? '').trim().slice(0, 5000)]).filter(([, v]) => v));

/** Names that are probably the same person: the same letters ("ArturoSantos"), a typo or two swapped letters
 *  ("Mansih Ladha"), or one name inside the other ("Dan Ani Manish Ladha"). */
const nameKey = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
export const namesLookAlike = (x, y) => {
  const a = nameKey(x), b = nameKey(y), short = Math.min(a.length, b.length);
  if (!a || !b || String(x).trim().toLowerCase() === String(y).trim().toLowerCase()) return false;
  return a === b || (short >= 6 && editDistance(a, b) <= 2) || (short >= 8 && (a.includes(b) || b.includes(a)));
};
