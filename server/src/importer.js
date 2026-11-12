// Reads Excel (.xlsx/.xls) or CSV files and turns them into ATLAS courses, lessons or instructors.
import * as XLSX from 'xlsx';
import { STATUSES, OUTLINE, SKILLS, LABLOC, IPOWN, TRAVEL, EMAIL, blankCourse, splitList, today, customKey, customFieldsOf, cleanOwned } from './constants.js';

const COURSE_ALIAS = {
  'course code': 'code', code: 'code', 'ibm course codes': 'ibmCode', 'ibm course code': 'ibmCode', 'ibm code': 'ibmCode', 'course name': 'name', title: 'name', 'on ibm pmt': 'pmt',
  vendor: 'vendor', platform: 'platform', portfolio: 'portfolio', product: 'product', status: 'status', instructor: 'instructors', instructors: 'instructors', 'instructor name': 'instructors', 'instructor names': 'instructors', 'instructor(s)': 'instructors', trainer: 'instructors', trainers: 'instructors', 'trainer name': 'instructors', faculty: 'instructors', 'skill level': 'skill',
  'duration (days)': 'duration', duration: 'duration', 'number of hours': 'hours', hours: 'hours', modality: 'delivery', 'course outline status': 'outlineStatus', 'link to course outline': 'outline',
  'course outline': 'outline', 'course description': 'description', description: 'description', 'course author email': 'author', 'planned completion date': 'planned', 'release date': 'release',
  'retire date': 'retire', 'ibm retirement date': 'ibmRetire', 'max students': 'maxStudents', 'pre reqs': 'prereqs', prerequisites: 'prereqs', objectives: 'objectives', 'learning objectives': 'objectives', 'course objectives': 'objectives', topics: 'topics', 'course topics': 'topics', 'topics covered': 'topics', persona: 'persona', 'lab configuration': 'labConfig',
  'delivery instruction notes': 'deliveryNotes', 'instructor daily rate': 'dailyRate', 'materials cost': 'materialsCost', 'lab cost': 'labCost', 'learning path': 'learningPath', badge: 'badge',
  certification: 'certification', notes: 'notes', 'record source': 'recordSource', 'create date': 'created', 'created date': 'created'
};
const INSTR_ALIAS = {
  name: 'name', 'full name': 'name', instructor: 'name', 'instructor name': 'name', 'name & contact': 'name', email: 'email', 'e-mail': 'email', 'email address': 'email', phone: 'phone', telephone: 'phone', 'telephone no': 'phone', 'phone number': 'phone', 'phone no': 'phone', mobile: 'phone', 'mobile number': 'phone', 'mobile no': 'phone', 'contact number': 'phone', 'contact no': 'phone', location: 'location',
  country: 'location', 'travel preference': 'travel', travel: 'travel', vendor: 'vendor', platform: 'platforms', platforms: 'platforms', portfolio: 'portfolio', product: 'product', 'primary product': 'product',
  'skills / products': 'skills', skills: 'skills', 'skills/products': 'skills', 'products & can teach': 'skills', 'courses can teach': 'canTeach', 'course author': 'canTeach', 'course authors': 'canTeach', 'author of': 'canTeach', 'authorised to teach': 'qualified', 'authorized to teach': 'qualified', 'courses ip owned': 'ipOwned', 'ip owned': 'ipOwned', 'ip owned courses': 'ipOwned', 'courses owned': 'ipOwned', 'ip owner of': 'ipOwned', 'qualified to teach': 'qualified', 'qualified': 'qualified', 'courses qualified to teach': 'qualified', 'can teach': 'canTeach', courses: 'canTeach',
  languages: 'languages', 'delivery languages': 'languages', language: 'languages', feedback: 'rating', 'client feedback': 'rating', rating: 'rating', comments: 'comments', notes: 'comments'
};
const LESSON_ALIAS = {
  'course code': 'code', code: 'code', course: 'code', 'lesson title': 'title', lesson: 'title', 'class title': 'title', 'lesson / class title': 'title', 'lesson/class title': 'title', title: 'title',
  'lesson name': 'title', 'timeline (mins)': 'mins', timeline: 'mins', 'duration (mins)': 'mins', minutes: 'mins', mins: 'mins', duration: 'mins', 'video link': 'video', video: 'video', 'video url': 'video',
  attachment: 'attachment', attachments: 'attachment', 'attachment link': 'attachment', article: 'article', 'article text': 'article', content: 'article', order: 'order', sequence: 'order', '#': 'order', 'lesson #': 'order'
};
const norm = (h) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const mapCourse = (h) => { const k = norm(h); if (!k) return null; if (COURSE_ALIAS[k]) return COURSE_ALIAS[k]; if (k.startsWith('lab location')) return 'labLocation'; if (k.startsWith('ip owner')) return 'ipOwner'; return null; };
// instructor sheets come from many places: also accept "Email ID", "E-mail Address", "Languages They Teach", "Mobile No." …
const mapInstr = (h) => {
  const k = norm(h).replace(/[*:.]+$/, '').trim();
  if (!k) return null;
  if (INSTR_ALIAS[k]) return INSTR_ALIAS[k];
  if (/\be-?mail\b|\bmail id\b/.test(k)) return 'email';
  if (/^(instructor|trainer|faculty)?\s*(full\s*)?name$/.test(k)) return 'name';
  if (/language/.test(k)) return 'languages';
  if (/phone|mobile|contact (no|number)/.test(k)) return 'phone';
  if (/^travel/.test(k)) return 'travel';
  return null;
};
const mapLesson = (h) => LESSON_ALIAS[norm(h)] || null;
const pad = (n) => String(n).padStart(2, '0');
const str = (v) => (v instanceof Date ? (isNaN(v) ? '' : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`) : String(v ?? '').trim());
const num = (v) => { const s = str(v); if (s === '') return ''; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? '' : n; };
const iso = (v) => { const s = str(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
// older inventory sheets say "nFolks" where the options now say Hazdemy
const rebrand = (v) => (/^\s*nfolks\s*$/i.test(v) ? 'Hazdemy' : v);
// a cell holding several addresses ("a@x.com, b@y.org") gives the first one
const firstEmail = (v) => (v.split(/[\s,;]+/).find((x) => x.includes('@')) || v).replace(/^mailto:/i, ''); // links copied from Outlook start with mailto:
// "Travel preference" answered Yes / No in some sheets
const travelOpt = (v) => (/^(y|yes|willing)$/i.test(v) ? 'Can Travel' : /^(n|no)$/i.test(v) ? 'Virtual Only' : pickOpt(v, TRAVEL));
function pickOpt(v, opts) {
  if (!v) return '';
  const f = opts.find((o) => o.toLowerCase() === v.toLowerCase());
  if (f) return f;
  if (/^foundation$/i.test(v)) return 'Foundational';
  if (/instructor.?owned/i.test(v)) return 'Instructor owned';
  if (/^n\/?a$/i.test(v)) return 'N/A';
  return v;
}
function headerAt(rows, map, need) {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const k = (rows[i] || []).map(map);
    if (need.every((n) => k.includes(n))) return i;
  }
  return -1;
}

export function readWorkbook(buffer, filename) {
  const isCsv = /\.csv$/i.test(filename || '');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: isCsv ? false : undefined });
  return wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
}

/** Build an import preview. Nothing is saved here. */
export function analyse(kind, sheets, db, { replace = false, sheet = null, filename = '', addFields = [], fixes = {}, force = [], prefer = [] } = {}) {
  const forced = new Set((Array.isArray(force) ? force : []).map(Number)); // rows to import even though a required cell is empty
  const isC = kind === 'courses';
  // fields added earlier (and the new columns ticked on the import page) are read into `extra`
  const custom = [...customFieldsOf(db, kind)];
  for (const label of addFields) if (String(label).trim() && !custom.some((f) => f.key === customKey(label))) custom.push({ key: customKey(label), label: String(label).trim(), isNew: true });
  const byLabel = new Map(custom.map((f) => [norm(f.label), f.key]));
  const base = isC ? mapCourse : mapInstr;
  const map = (h) => base(h) || (byLabel.has(norm(h)) ? 'cf:' + byLabel.get(norm(h)) : null);
  const need = isC ? ['code', 'name'] : ['name', 'email'];
  const lessonSheets = isC ? sheets.map((s, i) => ({ i, name: s.name, h: headerAt(s.rows, mapLesson, ['code', 'title']) }))
    .filter((s) => s.h >= 0 && (/lesson|class|module/i.test(s.name) || headerAt([sheets[s.i].rows[s.h]], mapCourse, ['name']) < 0)) : [];
  const mains = sheets.map((s, i) => ({ i, name: s.name, h: headerAt(s.rows, map, need), rows: s.rows.length }))
    .filter((s) => s.h >= 0 && !lessonSheets.some((l) => l.i === s.i)).sort((a, b) => b.rows - a.rows);
  if (!mains.length) {
    return { error: `No sheet has a header row with ${isC ? '“Course Code” and “Course Name”' : '“Name” and “Email”'} columns. Rename the headers, or start from the sample spreadsheet.` };
  }
  const main = (sheet && mains.find((m) => m.name === sheet)) || mains[0];
  const rows = sheets[main.i].rows.slice(main.h);
  const hdr = rows[0].map(map);
  const ignored = rows[0].filter((h, i) => String(h).trim() && !hdr[i]).length;
  // columns Hazdemy doesn't know yet, with a few of their values, so the page can offer to add them as fields
  const unknown = rows[0].map((h, i) => ({ header: String(h ?? '').trim(), i })).filter((c) => c.header && !hdr[c.i])
    .map((c) => ({ header: c.header, samples: [...new Set(rows.slice(1).map((r) => str(r[c.i])).filter(Boolean))].slice(0, 3), filled: rows.slice(1).filter((r) => str(r[c.i])).length }));
  const cfKeys = hdr.filter((k) => k && k.startsWith('cf:')).map((k) => k.slice(3));
  const withExtra = (o, raw) => { if (cfKeys.length) o.extra = Object.fromEntries(cfKeys.map((k) => [k, str(raw['cf:' + k])]).filter(([, v]) => v)); return o; };
  const existing = new Map(replace ? [] : isC ? db.courses.map((c) => [String(c.code).toLowerCase(), c]) : db.instructors.filter((x) => x.email).map((x) => [String(x.email).toLowerCase(), x]));
  const inFile = new Map(); // key -> the spreadsheet row it first appeared on
  // the sheet's own heading for a field, so a message can say "Email ID is empty"
  const heading = (k, fallback) => String(rows[0][hdr.indexOf(k)] ?? '').trim() || fallback;
  /** A skipped row: `kind` is missing | exists | duplicate | invalid; `why` is the message shown; `field` the column at fault. */
  const skip = (kind, why, field, extra = {}) => ({ kind, why, field, ...extra });
  const snap = (rec) => Object.fromEntries([...new Set(hdr.filter(Boolean))].map((k) => [k, k.startsWith('cf:') ? str(rec.extra?.[k.slice(3)]) : Array.isArray(rec[k]) ? rec[k].join(', ') : str(rec[k])]));
  const good = [], bad = [], goodRows = []; // goodRows: the spreadsheet row of each good record (for the preview)
  const fixedRows = {}; // row -> fields filled in on the import page
  const incompleteRows = {}; // row -> required fields imported empty (or as a placeholder) because the row was ticked anyway
  let blank = 0, noStatus = 0;

  // duplicates in the file: normally the first row wins; a row picked on the Compare window ("import this row instead") wins instead
  const preferred = new Set((Array.isArray(prefer) ? prefer : []).map(Number)), winner = new Map();
  if (preferred.size) rows.slice(1).forEach((r, idx) => {
    const row = main.h + idx + 2;
    if (!preferred.has(row)) return;
    const val = (k) => (typeof fixes[row]?.[k] === 'string' ? fixes[row][k] : r[hdr.indexOf(k)]);
    const key = isC ? str(val('code')).toLowerCase() : firstEmail(str(val('email'))).toLowerCase();
    if (key) winner.set(key, row);
  });
  const dupOf = (key, row) => (winner.has(key) ? (winner.get(key) !== row ? winner.get(key) : 0) : inFile.get(key) || 0);
  rows.slice(1).forEach((r, idx) => {
    const raw = {};
    hdr.forEach((k, i) => { if (k && (raw[k] == null || str(raw[k]) === '')) raw[k] = r[i]; });
    if (!Object.values(raw).some((v) => str(v) !== '')) { blank++; return; }
    const row = main.h + idx + 2;
    // values typed in on the import page for this row (a missing email, a corrected code…) win over the sheet
    const fixed = fixes[row] && typeof fixes[row] === 'object' ? Object.keys(fixes[row]).filter((k) => typeof fixes[row][k] === 'string') : [];
    for (const k of fixed) raw[k] = fixes[row][k].trim().slice(0, 2000);
    let o, why = '', incomplete = [];
    if (isC) {
      o = { code: str(raw.code), name: str(raw.name) };
      if (!o.code && !o.name) { blank++; return; }
      const key = o.code.toLowerCase();
      const ex = existing.get(key);
      if (!o.code) why = skip('missing', `${heading('code', 'Course Code')} is empty`, 'code');
      else if (!o.name) why = skip('missing', `${heading('name', 'Course Name')} is empty`, 'name');
      if (why?.kind === 'missing' && forced.has(row)) {
        incomplete = [why.field];
        if (!o.code) { let c = `NO-CODE-${row}`; while (existing.has(c.toLowerCase()) || inFile.has(c.toLowerCase())) c += '-2'; o.code = c; }
        if (!o.name) o.name = o.code;
        why = '';
      }
      else if (dupOf(key, row)) why = skip('duplicate', `Same course code as row ${dupOf(key, row)} in this file`, 'code', { dupOf: dupOf(key, row) });
      else if (ex) why = skip('exists', `Matches ${ex.code} · ${ex.name}`, 'code', { existingId: ex.id, existingName: ex.name, existing: snap(ex) });
      if (!why) {
        const st = str(raw.status);
        if (!st) noStatus++;
        o = blankCourse({
          ...o, ibmCode: str(raw.ibmCode), pmt: str(raw.pmt), vendor: str(raw.vendor), platform: str(raw.platform), portfolio: str(raw.portfolio), product: str(raw.product),
          status: st ? STATUSES.find((x) => x.toLowerCase() === st.toLowerCase()) || titleCase(st) : 'Pipeline', instructors: splitList(str(raw.instructors)), delivery: str(raw.delivery) || 'ILT',
          duration: num(raw.duration), hours: num(raw.hours), outlineStatus: pickOpt(str(raw.outlineStatus), OUTLINE), outline: str(raw.outline), description: str(raw.description),
          skill: pickOpt(str(raw.skill), SKILLS), maxStudents: num(raw.maxStudents), prereqs: str(raw.prereqs), objectives: str(raw.objectives), topics: str(raw.topics), persona: str(raw.persona), labConfig: str(raw.labConfig), deliveryNotes: str(raw.deliveryNotes),
          labLocation: pickOpt(rebrand(str(raw.labLocation)), LABLOC), ipOwner: pickOpt(rebrand(str(raw.ipOwner)), IPOWN), author: str(raw.author), planned: iso(raw.planned), release: iso(raw.release), retire: iso(raw.retire),
          ibmRetire: iso(raw.ibmRetire), dailyRate: str(raw.dailyRate), materialsCost: str(raw.materialsCost), labCost: str(raw.labCost), learningPath: str(raw.learningPath), badge: str(raw.badge),
          certification: str(raw.certification), recordSource: str(raw.recordSource) || filename, notes: str(raw.notes), created: iso(raw.created) || today()
        });
      }
    } else {
      o = { name: str(raw.name), email: firstEmail(str(raw.email)) };
      const key = o.email.toLowerCase();
      const ex = existing.get(key), raw2 = str(raw.email);
      if (!o.name) why = skip('missing', `${heading('name', 'Name')} is empty`, 'name');
      else if (!o.email) why = skip('missing', `${heading('email', 'Email')} is empty`, 'email');
      else if (!EMAIL.test(o.email)) why = skip('invalid', `${heading('email', 'Email')} isn’t a valid address: “${raw2.slice(0, 60)}”`, 'email');
      else if (dupOf(key, row)) why = skip('duplicate', `Same email as row ${dupOf(key, row)} in this file`, 'email', { dupOf: dupOf(key, row) });
      else if (ex) why = skip('exists', `Matches ${ex.name} (${ex.email})`, 'email', { existingId: ex.id, existingName: ex.name, existing: snap(ex) });
      if (why?.kind === 'missing' && forced.has(row)) {
        incomplete = [!o.name && 'name', !o.email && 'email'].filter(Boolean);
        if (!o.name) o.name = `Unnamed instructor (row ${row})`;
        why = '';
      }
      if (!why) {
        const n = num(raw.rating);
        o = { ...o, phone: str(raw.phone), location: str(raw.location), travel: travelOpt(str(raw.travel)), vendor: str(raw.vendor), platforms: splitList(str(raw.platforms)), portfolio: str(raw.portfolio), product: str(raw.product),
          skills: str(raw.skills), canTeach: str(raw.canTeach), qualified: str(raw.qualified), ipOwned: cleanOwned(str(raw.ipOwned)), languages: str(raw.languages), rating: n === '' ? '' : Math.min(5, Math.max(0, n)), comments: str(raw.comments) };
      }
    }
    // a skipped row keeps everything it had, so the preview can show the whole row
    if (why) { bad.push({ row, ...Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, str(v)])), code: o.code, name: o.name, email: o.email, ...why }); return; }
    if ((isC || o.email) && !inFile.has(isC ? o.code.toLowerCase() : o.email.toLowerCase())) inFile.set(isC ? o.code.toLowerCase() : o.email.toLowerCase(), row);
    good.push(withExtra(o, raw)); goodRows.push(row); if (fixed.length) fixedRows[row] = fixed; if (incomplete.length) incompleteRows[row] = incomplete;
  });

  let lessons = null;
  if (isC && lessonSheets[0]) {
    const ls = sheets[lessonSheets[0].i].rows.slice(lessonSheets[0].h);
    const lh = ls[0].map(mapLesson);
    const known = new Set(good.map((c) => c.code.toLowerCase()).concat(replace ? [] : db.courses.map((c) => String(c.code).toLowerCase())));
    const by = {}; let orphan = 0, count = 0;
    ls.slice(1).forEach((r) => {
      const raw = {};
      lh.forEach((k, i) => { if (k && raw[k] == null) raw[k] = r[i]; });
      const code = str(raw.code), title = str(raw.title);
      if (!title) return;
      if (!known.has(code.toLowerCase())) { orphan++; return; }
      (by[code.toLowerCase()] ||= []).push({ order: num(raw.order), title, mins: num(raw.mins), video: str(raw.video), attachment: str(raw.attachment), article: str(raw.article) });
      count++;
    });
    Object.values(by).forEach((a) => a.sort((x, y) => (x.order === '' ? 1e9 : x.order) - (y.order === '' ? 1e9 : y.order)));
    lessons = { sheet: lessonSheets[0].name, by, count, courses: Object.keys(by).length, orphan };
  }

  return {
    sheets: mains.map((m) => ({ name: m.name, rows: Math.max(0, m.rows - m.h - 1) })), sheet: main.name,
    columns: [...new Set(hdr.filter(Boolean))], // the fields this sheet has, in its column order (added fields as cf:key)
    customFields: custom.filter((f) => cfKeys.includes(f.key)).map(({ key, label, isNew }) => ({ key: 'cf:' + key, label, isNew: !!isNew })), unknown,
    good, goodRows, fixedRows, incompleteRows, bad, blank, noStatus, ignored, replace, lessons, existingCount: isC ? db.courses.length : db.instructors.length
  };
}

/** Sample workbooks offered from the import dialog. */
export function sampleWorkbook(kind) {
  const wb = XLSX.utils.book_new();
  if (kind === 'courses') {
    const C = [['Vendor', 'Platform', 'Portfolio', 'Product', 'Course Code', 'IBM Course Codes', 'Status', 'Course Name', 'Course Outline Status', 'Modality', 'Duration (days)', 'Number of Hours', 'on IBM PMT', 'Lab Location (ITZ , Hazdemy, Instructor owned, N/A)', 'IBM retirement date', 'IP Owner (Hazdemy, SubK)', 'Course Author Email', 'Planned Completion Date', 'Release Date', 'Retire Date', 'Course Description', 'Link to Course Outline', 'Skill Level', 'Max students', 'Pre Reqs', 'Persona', 'Lab Configuration', 'Delivery Instruction Notes', 'Instructor Daily rate', 'Materials Cost', 'Lab Cost', 'Learning Path', 'Badge', 'Certification', 'Notes', 'Record Source', 'Instructor'],
      ['IBM', 'Automation', 'Integration', 'webMethods Integration', 'HAZ-XX-101', 'V0100XXG', 'Available', 'Example: webMethods Integration Developer', 'Validated', 'ILT', 3, 24, 'Yes', 'ITZ', '', 'Hazdemy', 'author@example.com', '2026-12-15', '', '', 'Three-day hands-on course for integration developers.', 'https://example.com/outline.pdf', 'Intermediate', 12, '1–2 years of development experience', 'Developers', 'ITZ reservation', 'Bring a laptop', '', '', '', 'Integration Developer', '', '', '', 'Sample', 'Example Instructor']];
    const L = [['Course Code', 'Order', 'Lesson Title', 'Timeline (mins)', 'Video Link', 'Attachment', 'Article'],
      ['HAZ-XX-101', 1, 'Introduction and architecture', 45, 'https://example.com/video1', '', 'Overview of the platform and its components.'],
      ['HAZ-XX-101', 2, 'Building your first integration', 90, '', 'https://example.com/lab1.pdf', 'Guided lab.']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(C), 'Courses');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(L), 'Lessons');
  } else {
    const I = [['Name', 'Email', 'Telephone', 'Location', 'Platform', 'Portfolio', 'Product', 'Skills / products', 'Courses can teach', 'Vendor', 'Travel preference', 'Delivery languages', 'Comments'],
      ['Example Instructor', 'example.instructor@example.com', '+91 98765 43210', 'India', 'Data & AI, Security', 'Data Integration', 'DataStage', 'DataStage, Guardium', 'HAZ-XX-101', 'IBM', 'Can Travel', 'English, Hindi', '']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(I), 'Instructors');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
