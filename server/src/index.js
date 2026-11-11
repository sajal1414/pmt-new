import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadEnv } from './env.js';
import { init, load, save, reset, uid, log, backup, storage, DATA_FILE } from './db.js';
import { STATUSES, ROLES, EMAIL, phoneOk, PHONE_MSG, COURSE_FIELDS, INSTRUCTOR_FIELDS, blankCourse, splitList, customKey, customFieldsOf, cleanExtra, namesLookAlike } from './constants.js';
import { readWorkbook, analyse, sampleWorkbook } from './importer.js';
import { readDocument, parseOutline, matchCourse, outlineToCourse } from './outline.js';
import { isHtml, sanitizeHtml } from './richtext.js';
import { coursePdf, certificatePdf, pdfFields } from './pdf.js';
import { catalogPdf, catalogXlsx, CATALOG_FIELDS, CATALOG_DEFAULTS } from './catalog.js';
import JSZip from 'jszip';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { generateSample, clearSample, ensureLearning, teachingCourses, isoDay } from './learning.js';
import { mountTeach, signatureProblem } from './teach.js';
import { mountLearn, ensureStudent, handleStripeWebhook } from './learn.js';
import { mountAdmin } from './admin.js';
import { sampleMode } from './seed.js';
import { mountPublicApi, mountApiAdmin } from './public-api.js';
import { cleanSchedules, autoSchedule, validZone } from './schedule.js';
import { settingsOf } from './settings.js';
import { mailConfig, sendMail, sendLater } from './mail.js';
import { securityHeaders, originGuard, passwordProblem, createThrottle, securityEvent, clientIp, isHttps } from './security.js';

loadEnv();

// a live site must not run on made-up secrets: stop with a clear message instead
const PRODUCTION = process.env.NODE_ENV === 'production';
if (PRODUCTION && String(process.env.ATLAS_SECRET || '').length < 32) {
  console.error('Set ATLAS_SECRET to a long random value (at least 32 characters) before starting in production.\nMake one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (PRODUCTION && !process.env.DATABASE_URL) console.warn('Warning: DATABASE_URL is not set, so data is kept in a file on this server. Use PostgreSQL unless this server has a permanent disk that is backed up.');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
const PORT = Number(process.env.PORT) || 4000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
// Stripe calls this itself (no sign-in, no browser origin); it is trusted only through its signature, checked on the raw body
app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), handleStripeWebhook);
app.use(express.json({ limit: '5mb' }));
app.use('/api', originGuard);

class HttpError extends Error { constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; } }
const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out instanceof Promise) out.then((v) => { if (v !== undefined) res.json(v); }, next);
    else if (out !== undefined) res.json(out);
  } catch (e) { next(e); }
};
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const publicUser = ({ passwordHash, ...u }) => u;
const hash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); };
const DUMMY_HASH = hash('not-a-real-password');
function verify(pw, stored) {
  const [salt, h] = String(stored || DUMMY_HASH).split(':');
  const a = Buffer.from(h || '', 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return !!stored && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- Sessions ---------- */
// Signed cookie "userId.expiry.signature". The signature covers the password hash, so changing a password signs out old sessions.
const COOKIE = 'atlas_session', SESSION_MS = 12 * 36e5, REMEMBER_MS = 30 * 864e5;
const KEY_FILE = path.join(path.dirname(DATA_FILE), 'session.key');
const SECRET = process.env.ATLAS_SECRET || (() => {
  try { return fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch {
    const k = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true }); fs.writeFileSync(KEY_FILE, k);
    return k;
  }
})();
// The data's sessionEpoch is part of the signature: "Sign out everyone" changes it, which ends every session.
const sign = (id, exp, pwHash) => { const ep = load().sessionEpoch; return crypto.createHmac('sha256', SECRET).update(`${id}.${exp}.${pwHash}${ep ? '.' + ep : ''}`).digest('base64url'); };
// "Remember me" keeps the cookie for 30 days; otherwise it's a browser-session cookie that also expires after 12 hours.
function startSession(req, res, u, remember = false) {
  const S = settingsOf(load()), keep = remember && S.allowRemember;
  const exp = Date.now() + (keep ? REMEMBER_MS : (+S.sessionHours || 12) * 36e5);
  res.setHeader('Set-Cookie', `${COOKIE}=${u.id}.${exp}.${sign(u.id, exp, u.passwordHash)}; Path=/; HttpOnly; SameSite=Lax${keep ? `; Max-Age=${REMEMBER_MS / 1000}` : ''}${isHttps(req) ? '; Secure' : ''}`);
}
const endSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
function sessionUser(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [id, exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  const u = load().users.find((x) => x.id === id);
  if (!u?.passwordHash || !(+exp > Date.now())) return null;
  const want = Buffer.from(sign(id, exp, u.passwordHash)), got = Buffer.from(sig || '');
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? u : null;
}

// Fresh data has no passwords yet: give the first admin a default one they must change at first sign-in.
const DEFAULT_ADMIN_PASSWORD = process.env.ATLAS_ADMIN_PASSWORD || 'atlas-admin';
function ensureAdminLogin() {
  const d = load();
  if (d.users.some((u) => u.role === 'Admin' && u.passwordHash)) return;
  const admin = d.users.find((u) => u.role === 'Admin');
  if (!admin) return;
  if (PRODUCTION && !process.env.ATLAS_ADMIN_PASSWORD) {
    console.error(`No admin password is set yet. Set ATLAS_ADMIN_PASSWORD for the first start (the admin, ${admin.email}, changes it at first sign-in).`);
    process.exit(1);
  }
  Object.assign(admin, { passwordHash: hash(DEFAULT_ADMIN_PASSWORD), status: 'Password pending' });
  save();
  // on a live server the password stays out of the logs (hosting dashboards keep them)
  console.log(`Sign in as ${admin.email} with ${PRODUCTION ? 'the password in ATLAS_ADMIN_PASSWORD' : `password "${DEFAULT_ADMIN_PASSWORD}"`}. You'll be asked to change it.`);
}

const throttle = createThrottle(); // slows down password guessing: per account and per network address
app.post('/api/login', wrap((req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || ''), f = {};
  if (!email) f.email = 'Enter your email.';
  if (!password) f.password = 'Enter your password.';
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  const d = load(), ip = clientIp(req), S = settingsOf(d);
  const block = throttle.blocked(email, ip);
  if (block) {
    securityEvent(d, 'Sign-in blocked', { email, ip, ok: false, detail: block.who === 'account' ? 'account locked' : 'too many attempts from this network' }); save();
    throw new HttpError(429, `Too many wrong passwords. Try again in ${Math.max(1, Math.ceil(block.wait / 60e3))} minute${block.wait > 60e3 ? 's' : ''}.`);
  }
  const u = d.users.find((x) => x.email.toLowerCase() === email);
  if (!verify(password, u?.passwordHash)) {
    const locked = throttle.fail(email, ip, { lockAfter: +S.lockAfter || 5, lockMinutes: +S.lockMinutes || 15 });
    securityEvent(d, locked ? 'Account locked' : 'Wrong password', { email, ip, ok: false, detail: u ? '' : 'no such account' }); save();
    throw new HttpError(locked ? 429 : 401, locked ? `Too many wrong passwords. This account is locked for ${+S.lockMinutes || 15} minutes.` : 'Email or password is incorrect.');
  }
  throttle.ok(email);
  if (u.status === 'Pending approval') throw new HttpError(403, 'Your account is waiting for an admin to approve it.');
  securityEvent(d, 'Signed in', { email: u.email, ip }); save();
  startSession(req, res, u, req.body.remember === true);
  return publicUser(u);
}));
// Self sign-up: the account can't sign in until an admin approves it on the Users page.
app.post('/api/signup', wrap((req, res) => {
  const d = load(), email = String(req.body.email || '').trim(), name = String(req.body.name || '').trim(), password = String(req.body.password || ''), f = {};
  if (!name) f.name = 'Enter your full name.';
  if (!email) f.email = 'Enter your email.'; else if (!EMAIL.test(email)) f.email = 'Enter an email like name@company.com.';
  else if (d.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) f.email = 'This email already has an account. Sign in instead.';
  if (!f.password && passwordProblem(password, email)) f.password = passwordProblem(password, email);
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  const S = settingsOf(d);
  if (req.body.role === 'learner' ? !S.learnerSignup : !S.instructorSignup) throw new HttpError(403, `New ${req.body.role === 'learner' ? 'learner' : 'instructor'} sign-ups are turned off. Ask an admin for an account.`);
  // learners can start straight away; instructor accounts wait for an admin to approve them
  if (req.body.role === 'learner') {
    const st = ensureStudent(d, { email, name }, uid);
    d.users.unshift({ id: uid('u'), email, name, role: 'Learner', status: 'Active', instructorId: '', studentId: st.id, passwordHash: hash(password) });
    log(`${name} (${email}) signed up as a learner`); save();
    res.status(201); return { ok: true, role: 'Learner' };
  }
  const inst = d.instructors.find((i) => i.email.toLowerCase() === email.toLowerCase());
  const u = { id: uid('u'), email, name, role: 'Instructor', status: 'Pending approval', instructorId: inst?.id || '', passwordHash: hash(password) };
  d.users.unshift(u); log(`${name} (${email}) requested an instructor account`); save();
  res.status(201); return { ok: true, role: 'Instructor' };
}));
app.post('/api/logout', wrap((req, res) => { const u = sessionUser(req); if (u) { securityEvent(load(), 'Signed out', { email: u.email, ip: clientIp(req) }); save(); } endSession(res); return { ok: true }; }));

// public course API for the websites (own key check, so it sits before the sign-in check)
mountPublicApi(app, { wrap, HttpError, load, save, uid, log, sessionUser });
// the embeddable course list the websites load with one <script> tag
app.get('/embed/courses.js', (req, res) => {
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'embed', 'courses.js'));
});

const OPEN = ['POST /login', 'POST /signup', 'POST /logout', 'GET /me', 'GET /site'];
const PENDING_OK = ['POST /me/password'];
const ADMIN_ONLY = /^\/(users|reset|import|learning|admin)(\/|$)/;
app.use('/api', (req, res, next) => {
  req.user = sessionUser(req);
  const route = `${req.method} ${req.path}`;
  if (OPEN.includes(route)) return next();
  if (!req.user) return next(new HttpError(401, 'Your session has ended. Sign in again.'));
  if (req.user.status === 'Password pending' && !PENDING_OK.includes(route)) return next(new HttpError(403, 'Set a new password first.'));
  if (req.user.role === 'Learner' && !/^\/(learn|me|logout)(\/|$)/.test(req.path)) return next(new HttpError(403, 'That isn’t available to learners.'));
  if (req.user.role !== 'Admin') {
    // instructors work in /teach: they can read the catalog and edit their own courses, but not run the admin side
    const adminWrite = (/^\/instructors(\/|$)/.test(req.path) && req.method !== 'GET') || (/^\/courses\/[^/]+$/.test(req.path) && req.method === 'DELETE');
    if (ADMIN_ONLY.test(req.path) || adminWrite) return next(new HttpError(403, 'Only admins can do that.'));
  }
  next();
});
// public bits of the site settings (sign-in page, help links)
app.get('/api/site', wrap(() => { const S = settingsOf(load()); return { siteName: S.siteName, supportEmail: S.supportEmail, supportPhone: S.supportPhone, learnerSignup: S.learnerSignup, instructorSignup: S.instructorSignup, mail: mailConfig().configured && !!S.emailOn }; }));
app.get('/api/me', wrap((req) => { if (!req.user) throw new HttpError(401, 'Not signed in.'); return publicUser(req.user); }));
app.post('/api/me/password', wrap((req, res) => {
  const u = req.user, current = String(req.body.current || ''), password = String(req.body.password || ''), f = {};
  if (!verify(current, u.passwordHash)) f.current = 'Current password is incorrect.';
  if (passwordProblem(password, u.email)) f.password = passwordProblem(password, u.email);
  else if (password === current) f.password = 'Choose a password different from the current one.';
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  Object.assign(u, { passwordHash: hash(password), status: 'Active' });
  log(`${u.name || u.email} set a new password`); securityEvent(load(), 'Password changed', { email: u.email, ip: clientIp(req) }); save();
  startSession(req, res, u);
  return publicUser(u);
}));

/* ---------- Security (Site Settings) ---------- */
app.get('/api/admin/security', wrap((req) => {
  const d = load(), admins = d.users.filter((u) => u.role === 'Admin');
  const defaultPw = admins.some((u) => verify(DEFAULT_ADMIN_PASSWORD, u.passwordHash));
  const since = Date.now() - 864e5, recent = (d.securityLog || []).filter((e) => Date.parse(e.at) > since);
  const checks = [
    { ok: isHttps(req), title: 'HTTPS', text: isHttps(req) ? 'Connections are encrypted.' : 'This server is on plain HTTP. Fine on your own computer; put it behind HTTPS before going online.' },
    { ok: !!process.env.ATLAS_SECRET, title: 'Session secret', text: process.env.ATLAS_SECRET ? 'Set from ATLAS_SECRET.' : 'Kept in server/data/session.key. Set ATLAS_SECRET on the server you host it on.' },
    { ok: !defaultPw, title: 'Default admin password', text: defaultPw ? 'An admin still uses the default password. Change it now.' : 'No admin uses the default password.' },
    { ok: admins.length <= 3, title: 'Admin accounts', text: `${admins.length} admin account${admins.length === 1 ? '' : 's'}. Keep admins to the people who need it.` },
    { ok: true, title: 'Sign-in protection', text: `Accounts lock for ${settingsOf(d).lockMinutes} minutes after ${settingsOf(d).lockAfter} wrong passwords; one network is limited to 30 wrong attempts per 15 minutes.` },
    { ok: true, title: 'Browser protection', text: 'Security headers, Content-Security-Policy and a same-site check on every change are on.' },
    { ok: recent.filter((e) => !e.ok).length < 20, title: 'Failed sign-ins (24 h)', text: `${recent.filter((e) => !e.ok).length} failed or blocked sign-ins in the last 24 hours.` }
  ];
  return { checks, locked: throttle.locked(), log: (d.securityLog || []).slice(0, 100) };
}));
app.post('/api/admin/security/unlock', wrap((req) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  throttle.unlock(email);
  securityEvent(load(), 'Account unlocked', { email, ip: clientIp(req), detail: `by ${req.user.email}` }); save();
  return { ok: true };
}));
app.post('/api/admin/security/signout-all', wrap((req, res) => {
  const d = load();
  d.sessionEpoch = Date.now();
  securityEvent(d, 'Everyone signed out', { email: req.user.email, ip: clientIp(req) }); log('All sessions were ended by an admin'); save();
  startSession(req, res, req.user); // keep the admin who did it signed in
  return { ok: true };
}));

/* ---------- Courses ---------- */
function validateCourse(c, id) {
  const d = load(), f = {};
  if (!String(c.name || '').trim()) f.name = 'Course name is required.';
  if (!String(c.code || '').trim()) f.code = 'Course code is required.';
  else if (d.courses.some((x) => x.id !== id && String(x.code).toLowerCase() === String(c.code).trim().toLowerCase())) f.code = `Another course already uses code ${c.code}.`;
  // author can be a name ("Megan Irvine") or an email; only check it as an email when it looks like one
  if (c.author && String(c.author).includes('@') && !EMAIL.test(String(c.author).trim())) f.author = 'Enter a name, or an email like name@company.com.';
  if (c.status && !STATUSES.includes(c.status) && !id) f.status = 'Choose a status from the list.';
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
}
/** A unit's questions and answers: [{ id, q, a }], blank questions dropped, at most 50. */
const cleanQa = (list) => (Array.isArray(list) ? list : []).map((x) => ({ id: String(x?.id || '').startsWith('new-') || !x?.id ? uid('qa') : String(x.id), q: String(x?.q || '').trim().slice(0, 500), a: String(x?.a || '').trim().slice(0, 5000) }))
  .filter((x) => x.q).slice(0, 50);
function cleanCourse(body) {
  const c = pick(body, COURSE_FIELDS);
  for (const k of ['name', 'code']) if (k in c) c[k] = String(c[k]).trim();
  for (const k of ['duration', 'hours', 'maxStudents', 'price']) if (k in c && c[k] !== '' && c[k] != null) c[k] = Number(c[k]);
  for (const k of ['topics', 'objectives']) if (isHtml(c[k])) c[k] = sanitizeHtml(c[k]); // rich text from the editor
  if ('instructors' in c) c.instructors = Array.isArray(c.instructors) ? c.instructors.map(String) : splitList(c.instructors);
  if ('lessons' in c) c.lessons = (c.lessons || []).map((l) => ({ id: l.id || uid('l'), day: String(l.day || '').trim(), title: String(l.title || '').trim(), mins: l.mins === '' || l.mins == null ? '' : Number(l.mins), video: l.video || '', attachment: l.attachment || '', article: l.article || '', qa: cleanQa(l.qa) })).filter((l) => l.title);
  if ('schedules' in c) { const e = {}; c.schedules = cleanSchedules(c.schedules, uid, e); if (e.schedules) throw new HttpError(422, 'Fix the highlighted fields.', e); }
  if ('customFor' in c) c.customFor = String(c.customFor || '').trim().slice(0, 120);
  if ('extra' in c) c.extra = cleanExtra(c.extra, customFieldsOf(load(), 'courses'));
  if ('baseCourse' in c) c.baseCourse = String(c.baseCourse || '');
  return c;
}
/** The instructor profile of a signed-in instructor (null for admins). */
const instructorOf = (user) => (user.role === 'Admin' ? null : load().instructors.find((i) => i.id === user.instructorId) || null);
const teaches = (inst, c) => (c.instructors || []).some((n) => n.trim().toLowerCase() === inst.name.trim().toLowerCase());
function assertOwnCourse(user, c) {
  if (user.role === 'Admin') return;
  const inst = instructorOf(user);
  if (!inst || !teaches(inst, c)) throw new HttpError(403, 'You can only change courses you teach.');
}
/* Instructors only see the courses they teach, and on those only themselves as instructor and only their own batches:
   who else teaches a course (its other instructors, and the batches another instructor runs) is for admins only.
   A batch with no instructor set belongs to the course, so every instructor of the course sees it. Admins see everything. */
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const othersBatch = (b, inst) => !!b.instructor && !sameName(b.instructor, inst.name);
const maskCourse = (c, inst) => ({ ...c, instructors: [inst.name], schedules: (c.schedules || []).filter((b) => !othersBatch(b, inst)) });
/** What `user` may read of course `c`: the course itself (admins), it masked (its instructor), or null. */
function courseFor(user, c) {
  if (!c) return null;
  if (user.role === 'Admin') return c;
  const inst = instructorOf(user);
  return inst && teaches(inst, c) ? maskCourse(c, inst) : null;
}
const visibleCourses = (user, list = load().courses) => list.map((c) => courseFor(user, c)).filter(Boolean);
function readableCourse(user, id) {
  const c = courseFor(user, load().courses.find((x) => x.id === id));
  if (!c) throw new HttpError(404, 'Course not found.'); // the same answer for "missing" and "not yours"
  return c;
}
/**
 * An instructor saving a course they saw masked: the hidden co-instructors stay, and other instructors' batches (which
 * they never received) are kept as they are; they can't be changed or removed this way. Batches the instructor sends
 * are theirs or the course's: they can't hand one to someone else.
 */
function keepHidden(stored, next, inst) {
  next.instructors = [...(stored.instructors || [])];
  if (!teaches(inst, next)) next.instructors.push(inst.name); // can't remove yourself from your own course
  const hidden = (stored.schedules || []).filter((b) => othersBatch(b, inst)), hiddenIds = new Set(hidden.map((b) => b.id));
  const own = (next.schedules || []).filter((b) => !hiddenIds.has(b.id)).map((b) => (othersBatch(b, inst) ? { ...b, instructor: inst.name } : b));
  next.schedules = [...own, ...hidden];
}
app.get('/api/courses', wrap((req) => visibleCourses(req.user)));
// course codes made when none is typed: the next number in the series the platform's courses use (HAZ-DA-0051),
// and for a client version the original's code plus 3 letters of the client (HAZ-AT-008-MAC)
const taken = (d, code) => d.courses.some((x) => String(x.code).trim().toLowerCase() === code.toLowerCase());
function nextCode(d, platform = '') {
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const series = (list) => { const m = new Map(); for (const c of list) { const x = /^(.*?)(\d+)$/.exec(String(c.code || '').trim()); if (x && !c.baseCourse) m.set(x[1], (m.get(x[1]) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1])[0]?.[0]; };
  const word = String(platform).replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
  const prefix = series(d.courses.filter((c) => platform && same(c.platform, platform))) || (word ? `HAZ-${word}-` : series(d.courses) || 'HAZ-');
  const nums = d.courses.map((c) => String(c.code || '').trim()).filter((c) => c.toLowerCase().startsWith(prefix.toLowerCase()) && /^\d+$/.test(c.slice(prefix.length)));
  const width = Math.max(3, ...nums.map((c) => c.length - prefix.length));
  let n = Math.max(0, ...nums.map((c) => +c.slice(prefix.length))) + 1, code;
  while (taken(d, (code = prefix + String(n).padStart(width, '0')))) n++;
  return code;
}
function customCode(d, original, client) {
  const base = `${original.code}-${String(client).replace(/[^a-z0-9]+/gi, '').slice(0, 3).toUpperCase()}`;
  let code = base;
  for (let k = 2; taken(d, code); k++) code = base + k;
  return code;
}
// every batch across the courses (admins) or the courses you teach (instructors), with its course
app.post('/api/schedule/bulk-delete', wrap((req) => {
  const d = load(), inst = instructorOf(req.user), ids = new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : []);
  if (req.user.role !== 'Admin' && !inst) throw new HttpError(403, 'Only admins and instructors can change the schedule.');
  if (!ids.size) throw new HttpError(422, 'Select at least one batch.');
  let removed = 0;
  for (const c of d.courses) {
    if (inst && !teaches(inst, c)) continue;
    const before = (c.schedules || []).length;
    c.schedules = (c.schedules || []).filter((b) => !ids.has(b.id) || (inst && othersBatch(b, inst))); // an instructor can't delete another's batch
    removed += before - c.schedules.length;
  }
  if (removed) { log(`${removed} batch${removed === 1 ? '' : 'es'} deleted from the schedule`); save(); }
  return { removed };
}));
app.get('/api/schedule', wrap((req) => {
  const d = load(), inst = instructorOf(req.user);
  if (req.user.role !== 'Admin' && !inst) throw new HttpError(403, 'Only admins and instructors can see the schedule.');
  const list = visibleCourses(req.user, d.courses); // an instructor's own courses, masked
  const courseOf = (c) => ({ id: c.id, code: c.code, name: c.name, customFor: c.customFor || '', duration: c.duration ?? '', instructors: c.instructors || [], maxStudents: c.maxStudents ?? '' });
  // the courses a batch can be added to, and every batch with its course
  return { courses: list.map(courseOf), batches: list.flatMap((c) => (c.schedules || []).map((b) => ({ ...b, course: courseOf(c) }))) };
}));
// Auto-schedule (admins): sample batches from a start date for a number of months; a backup is saved first
app.post('/api/schedule/auto', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can auto-schedule.');
  const DAY = /^\d{4}-\d{2}-\d{2}$/, f = {};
  let from = String(req.body.from || '');
  const months = Math.min(6, Math.max(1, Math.round(+req.body.months || 3)));
  const timeZone = validZone(String(req.body.timeZone || '')) ? String(req.body.timeZone) : 'America/New_York';
  const statuses = (Array.isArray(req.body.statuses) ? req.body.statuses : []).map(String).filter((s) => load().courses.some((c) => c.status === s)); // statuses the courses use
  if (!DAY.test(from)) f.from = 'Choose a start date.'; else if (from < isoDay(Date.now())) f.from = 'Choose today or a later date.';
  if (!statuses.length) f.statuses = 'Choose at least one course status.';
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  const t = new Date(from + 'T12:00:00Z'); t.setUTCMonth(t.getUTCMonth() + months); t.setUTCDate(t.getUTCDate() - 1);
  const to = t.toISOString().slice(0, 10), d = load();
  const kept = `atlas.backup-before-auto-schedule-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-')}.json`;
  backup(kept);
  const r = autoSchedule(d, { from, to, statuses, timeZone }, uid);
  log(`Auto-schedule: ${r.added} batches added to ${r.courses} courses (${from} to ${to})`); save();
  return { ...r, from, to, backup: kept };
}));
// remove the auto-scheduled batches that haven't started and have no learners
app.post('/api/schedule/auto/remove', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can do that.');
  const d = load(), today = isoDay(Date.now());
  let removed = 0;
  for (const c of d.courses) {
    const before = (c.schedules || []).length;
    c.schedules = (c.schedules || []).filter((b) => !(b.auto && b.startDate > today && !(b.learners || []).length));
    removed += before - c.schedules.length;
  }
  if (removed) { log(`Auto-schedule: ${removed} sample batches removed`); save(); }
  return { removed };
}));
/* ---------- email (SMTP settings in server/.env) ---------- */
const siteUrl = (req) => (req.headers.origin || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`).replace(/\/$/, '');
const siteName = () => settingsOf(load()).siteName || 'Hazdemy';
// emails go out only when an admin has switched sending on in Site Settings
const mailOn = () => mailConfig().configured && !!settingsOf(load()).emailOn;
const needMail = () => { if (!mailConfig().configured) throw new HttpError(409, 'Email isn’t set up yet: add the SMTP settings to server/.env.'); if (!settingsOf(load()).emailOn) throw new HttpError(409, 'Email sending is switched off in Site Settings.'); };
app.get('/api/admin/mail', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can see this.');
  const { configured, host, port, secure, user, from } = mailConfig(); // never the password
  return { configured, host, port, secure, user, from, on: !!settingsOf(load()).emailOn };
}));
app.post('/api/admin/mail/test', wrap(async (req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can send a test email.');
  const to = String(req.body.to || req.user.email).trim();
  if (!EMAIL.test(to)) throw new HttpError(422, 'Fix the highlighted fields.', { to: 'Enter an email like name@company.com.' });
  try { await sendMail({ to, subject: `${siteName()} test email`, text: `This is a test email from ${siteName()}.\n\nIf you can read this, email is set up correctly.\n\n${siteUrl(req)}`, site: siteName() }); }
  catch (e) { throw new HttpError(502, e.message); }
  log(`Test email sent to ${to}`); save();
  return { sent: true, to };
}));
// new sign-ins: email each person their temporary password (only accounts whose password it really is)
app.post('/api/mail/sign-ins', wrap(async (req) => {
  if (req.user.role !== 'Admin' && !instructorOf(req.user)) throw new HttpError(403, 'Only admins and instructors can do that.');
  needMail();
  const d = load(), list = (Array.isArray(req.body.accounts) ? req.body.accounts : []).slice(0, 300);
  let sent = 0; const failed = [];
  for (const a of list) {
    const u = d.users.find((x) => x.email.toLowerCase() === String(a.email || '').toLowerCase());
    if (!u || u.status !== 'Password pending' || !verify(String(a.password || ''), u.passwordHash)) { failed.push(a.email); continue; }
    try {
      await sendMail({ to: u.email, site: siteName(), subject: `Your ${siteName()} sign-in`, text: [`Hello ${u.name || ''},`.trim(), '',
        `An account has been created for you on ${siteName()}${u.role === 'Instructor' ? ' as an instructor' : ''}.`, '',
        `Sign in at: ${siteUrl(req)}/login`, `Email: ${u.email}`, `Temporary password: ${a.password}`, '',
        'You’ll be asked to choose your own password the first time you sign in.'].join('\n') });
      sent++;
    } catch (e) { if (!sent && !failed.length) throw new HttpError(502, e.message); failed.push(u.email); }
  }
  if (sent) { log(`Sign-in emails sent to ${sent} ${sent === 1 ? 'person' : 'people'}`); save(); }
  return { sent, failed };
}));
// email the learners on a batch (they're in Bcc, so they don't see each other)
app.post('/api/schedule/email', wrap(async (req) => {
  const d = load(), inst = instructorOf(req.user), c = d.courses.find((x) => x.id === String(req.body.courseId || ''));
  if (req.user.role !== 'Admin' && !(inst && c && teaches(inst, c))) throw new HttpError(403, 'You can only email learners on your own courses.');
  const b = (c?.schedules || []).find((x) => x.id === String(req.body.batchId || ''));
  if (!b || (inst && othersBatch(b, inst))) throw new HttpError(404, 'Batch not found.'); // not another instructor's batch
  if (!(b.learners || []).length) throw new HttpError(422, 'This batch has no learners yet.');
  needMail();
  const subject = String(req.body.subject || '').trim().slice(0, 200), text = String(req.body.body || '').trim().slice(0, 10000);
  if (!subject || !text) throw new HttpError(422, 'Fix the highlighted fields.', { [subject ? 'body' : 'subject']: 'Required.' });
  try { await sendMail({ bcc: b.learners, to: mailConfig().from, replyTo: req.user.email, subject, text, site: siteName() }); }
  catch (e) { throw new HttpError(502, e.message); }
  log(`Email sent to the ${b.learners.length} learners of the ${c.code} batch of ${b.startDate}`); save();
  return { sent: b.learners.length };
}));
// a learner's request was answered: tell them by email too
const tellRequester = (req, r) => mailOn() && sendLater({ to: r.email, site: siteName(),
  subject: r.kind === 'details' ? `About ${r.course}: ${r.status === 'Approved' ? 'price and details' : r.status.toLowerCase()}`
    : `Your ${r.kind === 'batch' ? 'batch' : r.kind === 'change' ? 'batch change' : 'custom version'} request: ${r.status.toLowerCase()}`,
  text: [`Hello ${r.name || ''},`.trim(), '', `Your request about ${r.course} was ${r.status.toLowerCase()}.`, r.reply ? `\n${r.reply}` : '', '', `See it here: ${siteUrl(req)}/learn/courses/${r.courseId}`].join('\n') });

// learners' requests for a batch or a custom version (admins)
const REQ_STATUSES = ['New', 'Approved', 'Declined'];
app.get('/api/requests', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can see requests.');
  const d = load();
  return (d.requests || []).map((r) => { const c = d.courses.find((x) => x.id === r.courseId); return { ...r, courseName: c?.name || '', courseCode: c?.code || '', instructors: c?.instructors || [] }; });
}));
app.post('/api/requests/:id/move', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can answer requests.');
  const d = load(), r = (d.requests || []).find((x) => x.id === req.params.id);
  if (!r) throw new HttpError(404, 'Request not found.');
  const c = d.courses.find((x) => x.id === r.courseId), b = (c?.schedules || []).find((x) => x.id === String(req.body.batchId || ''));
  if (!b) throw new HttpError(422, 'Choose the batch to move them to.');
  const email = String(r.email).toLowerCase();
  if (b.seats !== '' && b.seats != null && (b.learners || []).filter((x) => x !== email).length >= +b.seats) throw new HttpError(409, 'That batch is full.');
  for (const x of c.schedules || []) if (x.id !== b.id) x.learners = (x.learners || []).filter((m) => m !== email); // off the old batch
  if (!(b.learners ||= []).includes(email)) b.learners.push(email);
  const st = d.students.find((x) => x.id === r.studentId), e = st && d.enrollments.find((x) => x.studentId === st.id && x.courseId === c.id);
  if (e) e.batchId = b.id;
  const when = b.endDate && b.endDate !== b.startDate ? `${b.startDate} to ${b.endDate}` : b.startDate;
  Object.assign(r, { status: 'Approved', resultId: b.id, reply: String(req.body.reply || '').trim().slice(0, 1000) || `Moved to the batch of ${when}, ${b.startTime}–${b.endTime}.`, handledBy: req.user.name || req.user.email, handledAt: new Date().toISOString() });
  log(`${r.name} moved to the ${c.code} batch of ${when}`); save();
  tellRequester(req, r);
  return r;
}));
app.put('/api/requests/:id', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can answer requests.');
  const d = load(), r = (d.requests || []).find((x) => x.id === req.params.id);
  if (!r) throw new HttpError(404, 'Request not found.');
  if (!REQ_STATUSES.includes(req.body.status)) throw new HttpError(400, 'Choose Approved, Declined or New.');
  Object.assign(r, { status: req.body.status, reply: String(req.body.reply ?? r.reply ?? '').trim().slice(0, 1000), resultId: String(req.body.resultId ?? r.resultId ?? ''),
    handledBy: req.user.name || req.user.email, handledAt: new Date().toISOString() });
  log(`Request from ${r.name} (${r.kind === 'batch' ? 'new batch' : r.kind === 'change' ? 'batch change' : r.kind === 'details' ? 'price and details' : 'custom version'}, ${r.course}) ${r.status.toLowerCase()}`); save();
  if (r.status !== 'New') tellRequester(req, r);
  return r;
}));
app.get('/api/courses/next-code', wrap((req) => ({ code: nextCode(load(), String(req.query.platform || '').slice(0, 120)) })));
app.get('/api/courses/:id', wrap((req) => readableCourse(req.user, req.params.id)));
app.get('/api/courses/:id/pdf', (req, res, next) => {
  let c;
  try { c = readableCourse(req.user, req.params.id); } catch (e) { return next(e); }
  const name = `${c.code} - ${c.name}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  // ?fields=a,b,c picks what to show (see PDF_FIELDS); without it everything is shown
  const fields = req.query.fields == null ? undefined : pdfFields(String(req.query.fields).split(','));
  try { coursePdf(c, res, { fields }); } catch (e) { next(e); }
});
// the course catalog as one PDF, grouped Vendor > Platform > Portfolio > Product (all courses, or the ids sent)
app.post('/api/courses/catalog-pdf', (req, res, next) => {
  try {
    const d = load(), ids = Array.isArray(req.body.ids) ? new Set(req.body.ids.map(String)) : null;
    const list = visibleCourses(req.user, ids ? d.courses.filter((c) => ids.has(c.id)) : d.courses);
    if (!list.length) throw new HttpError(422, 'There are no courses to put in the catalog.');
    const title = String(req.body.title || '').trim().slice(0, 80) || 'Course Catalog';
    const fields = Array.isArray(req.body.fields) ? req.body.fields.filter((k) => CATALOG_FIELDS.includes(k)) : CATALOG_DEFAULTS;
    // "View Details" links open the course at the address ATLAS was used from
    const baseUrl = (req.headers.origin || `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`).replace(/\/$/, '');
    const platformOrder = Array.isArray(req.body.platformOrder) ? req.body.platformOrder.map((x) => String(x).slice(0, 120)).slice(0, 200) : [];
    const excel = req.body.format === 'xlsx', opts = { title, subtitle: String(req.body.subtitle || '').slice(0, 80), fields, baseUrl, platformOrder };
    const name = `${title} ${isoDay(Date.now())}.${excel ? 'xlsx' : 'pdf'}`.replace(/[\\/:*?"<>|]+/g, ' ');
    res.setHeader('Content-Type', excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    if (excel) res.send(catalogXlsx(list, opts)); else catalogPdf(list, opts, res);
  } catch (e) { next(e); }
});
// several course PDFs at once, as one ZIP (bulk download on the Courses page)
const pdfBuffer = (c, opts) => new Promise((resolve, reject) => {
  const out = new PassThrough(), parts = [];
  out.on('data', (b) => parts.push(b)); out.on('end', () => resolve(Buffer.concat(parts))); out.on('error', reject);
  coursePdf(c, out, opts);
});
app.post('/api/courses/pdf-zip', wrap(async (req, res) => {
  const d = load(), ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const list = visibleCourses(req.user, d.courses.filter((c) => ids.includes(c.id)));
  if (!list.length) throw new HttpError(422, 'Select at least one course.');
  if (list.length > 300) throw new HttpError(422, 'Select up to 300 courses at a time.');
  const zip = new JSZip(), used = new Set(), opts = { fields: req.body.fields == null ? undefined : pdfFields(req.body.fields) };
  for (const c of list) {
    let name = `${c.code} - ${c.name}`.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    while (used.has(name.toLowerCase())) name += ' (2)';
    used.add(name.toLowerCase());
    zip.file(name + '.pdf', await pdfBuffer(c, opts));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="atlas-courses-${list.length}-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(buf);
}));
app.post('/api/courses', wrap((req, res) => {
  const c = blankCourse(cleanCourse(req.body));
  if (!String(c.code || '').trim()) c.code = nextCode(load(), c.platform); // no code typed: the next one in the series
  const inst = instructorOf(req.user);
  if (req.user.role !== 'Admin' && !inst) throw new HttpError(403, 'Your account isn’t linked to an instructor profile yet.');
  if (inst) { c.instructors = [inst.name]; if (!req.body.status) c.status = 'Draft'; } // an instructor's new course is theirs alone; admins add others
  validateCourse(c);
  c.id = uid('c'); c.updated = new Date().toISOString();
  // a Word outline read into the new-course form: keep its file with the course
  const doc = req.body.outlineToken && pendingDocs.get(String(req.body.outlineToken));
  if (doc) { attachOutline(c, doc); pendingDocs.delete(String(req.body.outlineToken)); }
  load().courses.unshift(c); log(`Course ${c.name} created`); syncInstructors(load());
  const accounts = batchAccounts(load(), c); save();
  res.status(201); return { ...courseFor(req.user, c), accounts };
}));
// a client's own version of a course: a copy of its content, tagged with the client and linked back to the original
app.post('/api/courses/:id/customize', wrap((req, res) => {
  const d = load(), src = d.courses.find((x) => x.id === req.params.id);
  if (!src) throw new HttpError(404, 'Course not found.');
  assertOwnCourse(req.user, src);
  const customFor = String(req.body.customFor || '').trim().slice(0, 120);
  if (!customFor) throw new HttpError(422, 'Fix the highlighted fields.', { customFor: 'Enter the client this version is for.' });
  const original = src.baseCourse && d.courses.find((x) => x.id === src.baseCourse) || src; // customising a custom version still links to the original
  const c = { ...structuredClone(src), ...cleanCourse({ name: req.body.name || `${original.name} for ${customFor}`, code: req.body.code || customCode(d, original, customFor) }),
    customFor, baseCourse: original.id, status: STATUSES.includes(req.body.status) ? req.body.status : src.status, created: new Date().toISOString().slice(0, 10) };
  c.lessons = (c.lessons || []).map((l) => ({ ...l, id: uid('l') }));
  c.schedules = req.body.schedules ? (c.schedules || []).map((b) => ({ ...b, id: uid('sch') })) : [];
  validateCourse(c);
  c.id = uid('c'); c.updated = new Date().toISOString();
  d.courses.unshift(c); log(`Custom version ${c.name} created for ${customFor}`); syncInstructors(d); save();
  res.status(201); return courseFor(req.user, c);
}));
app.put('/api/courses/:id', wrap((req) => {
  const d = load(), i = d.courses.findIndex((x) => x.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Course not found.');
  assertOwnCourse(req.user, d.courses[i]);
  const next = { ...d.courses[i], ...cleanCourse(req.body), id: d.courses[i].id, updated: new Date().toISOString() };
  const inst = instructorOf(req.user);
  if (inst) keepHidden(d.courses[i], next, inst); // they saw only themselves: co-instructors and others' batch instructors stay as they were
  validateCourse(next, next.id);
  d.courses[i] = next; log(`Course ${next.name} updated`); syncInstructors(d);
  const accounts = batchAccounts(d, next); save();
  return { ...courseFor(req.user, next), accounts };
}));
app.delete('/api/courses/:id', wrap((req, res) => {
  const d = load(), i = d.courses.findIndex((x) => x.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Course not found.');
  const [c] = d.courses.splice(i, 1); log(`Course ${c.name} deleted`); save();
  res.status(204).end();
}));
// delete several courses at once (Courses page selection). A backup of the data is written first, so it can be undone.
app.post('/api/courses/bulk-delete', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can delete courses.');
  const d = load(), ids = new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : []);
  const gone = d.courses.filter((c) => ids.has(c.id));
  if (!gone.length) throw new HttpError(422, 'Select at least one course.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  const kept = `atlas.backup-before-delete-${stamp}.json`;
  backup(kept);
  d.courses = d.courses.filter((c) => !ids.has(c.id));
  log(`${gone.length} course${gone.length === 1 ? '' : 's'} deleted: ${gone.slice(0, 5).map((c) => c.code).join(', ')}${gone.length > 5 ? ` and ${gone.length - 5} more` : ''}`); save();
  return { deleted: gone.length, backup: kept };
}));

/* ---------- Instructors ---------- */
function cleanInstructor(body) {
  const x = pick(body, INSTRUCTOR_FIELDS);
  if ('platforms' in x) x.platforms = Array.isArray(x.platforms) ? x.platforms : splitList(x.platforms);
  if ('rating' in x) x.rating = x.rating === '' || x.rating == null ? '' : Math.min(5, Math.max(0, Number(x.rating)));
  for (const k of ['name', 'email', 'phone']) if (k in x) x[k] = String(x[k] ?? '').trim();
  if (x.email) x.email = x.email.replace(/^mailto:/i, '');
  if ('extra' in x) x.extra = cleanExtra(x.extra, customFieldsOf(load(), 'instructors'));
  return x;
}
function validateInstructor(x, id) {
  const f = {};
  if (!x.name) f.name = 'Name is required.';
  if (x.email && !EMAIL.test(x.email)) f.email = 'Enter an email like name@company.com.';
  else if (x.email && load().instructors.some((r) => r.id !== id && r.email && r.email.toLowerCase() === x.email.toLowerCase())) f.email = 'This email is already registered.';
  if (!phoneOk(x.phone)) f.phone = PHONE_MSG;
  if (x.rating !== '' && x.rating != null && isNaN(x.rating)) f.rating = 'Enter a number from 0 to 5.';
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
}
// signatures are only needed for certificates, so the list says whether one exists instead of sending the image
// admins: every instructor; an instructor: only their own profile (not other instructors' contact details)
app.get('/api/instructors', wrap((req) => load().instructors.filter((i) => req.user.role === 'Admin' || i.id === req.user.instructorId)
  .map(({ signature, ...i }) => ({ ...i, hasSignature: !!signature }))));
// learner star ratings, worked out live from reviews so a new review shows on every page straight away
app.get('/api/ratings', wrap((req) => {
  const d = load(); ensureLearning(d);
  // an instructor gets the ratings of their own courses and their own rating only
  const mine = req.user.role === 'Admin' ? null : instructorOf(req.user);
  if (req.user.role !== 'Admin' && !mine) return { courses: {}, instructors: {} };
  const seeCourse = mine ? new Set(teachingCourses(d, mine).map((c) => c.id)) : null;
  const avg = (list) => (list.length ? Math.round((list.reduce((a, v) => a + v.rating, 0) / list.length) * 10) / 10 : null);
  const names = new Map(d.students.map((s) => [s.id, s.name]));
  const byCourse = new Map();
  for (const v of d.reviews) { if (!byCourse.has(v.courseId)) byCourse.set(v.courseId, []); byCourse.get(v.courseId).push(v); }
  const courses = {};
  for (const [id, list] of byCourse) {
    if (seeCourse && !seeCourse.has(id)) continue;
    courses[id] = { avg: avg(list), count: list.length, stars: [5, 4, 3, 2, 1].map((s) => list.filter((v) => v.rating === s).length),
      latest: [...list].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8)
        .map((v) => ({ id: v.id, rating: v.rating, comment: v.comment, instructorRating: v.instructorRating || null, instructorComment: v.instructorComment || '', date: v.date, reply: v.reply || '', student: names.get(v.studentId) || 'Learner' })) };
  }
  const instructors = {};
  for (const x of mine ? [mine] : d.instructors) {
    // learners rate the instructor separately; older reviews without that answer count their course rating
    const list = teachingCourses(d, x).flatMap((c) => byCourse.get(c.id) || []).map((v) => ({ rating: v.instructorId === x.id && v.instructorRating ? v.instructorRating : v.rating }));
    if (list.length) instructors[x.id] = { avg: avg(list), count: list.length };
  }
  return { courses, instructors };
}));
// every review behind a rating, with who wrote it: ?course=<id> or ?instructor=<id>
app.get('/api/ratings/reviews', wrap((req) => {
  const d = load(); ensureLearning(d);
  const names = new Map(d.students.map((s) => [s.id, s])), byId = new Map(d.courses.map((c) => [c.id, c]));
  const inst = req.query.instructor && d.instructors.find((x) => x.id === req.query.instructor);
  if (req.query.instructor && !inst) throw new HttpError(404, 'Instructor not found.');
  const ids = inst ? new Set(teachingCourses(d, inst).map((c) => c.id)) : new Set([String(req.query.course || '')]);
  // an instructor may read the reviews of their own courses, or of themselves, and nobody else's
  if (req.user.role !== 'Admin') {
    const me = instructorOf(req.user), own = me ? new Set(teachingCourses(d, me).map((c) => c.id)) : new Set();
    if ((inst && inst.id !== me?.id) || [...ids].some((id) => !own.has(id))) throw new HttpError(404, inst ? 'Instructor not found.' : 'Course not found.');
  }
  return d.reviews.filter((v) => ids.has(v.courseId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((v) => ({ id: v.id, student: names.get(v.studentId)?.name || 'Learner', email: names.get(v.studentId)?.email || '', sample: !!v.sample,
      courseId: v.courseId, code: byId.get(v.courseId)?.code || '', course: byId.get(v.courseId)?.name || '',
      rating: v.rating, comment: v.comment || '', instructorRating: inst ? (v.instructorId === inst.id && v.instructorRating) || null : v.instructorRating || null,
      instructorComment: inst && v.instructorId !== inst.id ? '' : v.instructorComment || '', date: v.date, reply: v.reply || '' }));
}));
// "Courses can teach" can also put the instructor on those courses: add their name to each course's instructor list
function assignCourses(d, name, ids) {
  const list = Array.isArray(ids) ? ids.map(String) : [];
  const done = [];
  for (const c of d.courses) if (list.includes(c.id) && !(c.instructors ||= []).some((n) => n.trim().toLowerCase() === name.trim().toLowerCase())) { c.instructors.push(name); done.push(c.code); }
  if (done.length) log(`${name} assigned to ${done.join(', ')}`);
}
// every instructor with an email gets an Instructor sign-in linked to their profile, with a temporary password
// they change at first sign-in. Returns { name, email, password } for each account made (shown to the admin once).
const tempPassword = () => 'Hz' + crypto.randomBytes(5).toString('hex') + crypto.randomInt(10, 100);
function instructorAccounts(d, list, chosen = '') {
  const made = [];
  for (const x of list) {
    const email = String(x.email || '').trim();
    if (!EMAIL.test(email)) continue;
    const u = d.users.find((y) => y.email.toLowerCase() === email.toLowerCase());
    if (u) { if (u.role === 'Instructor' && !u.instructorId) u.instructorId = x.id; continue; } // already has a sign-in: just link it
    const password = chosen || tempPassword();
    d.users.unshift({ id: uid('u'), email, name: x.name || '', role: 'Instructor', status: 'Password pending', instructorId: x.id, passwordHash: hash(password) });
    made.push({ name: x.name || '', email, password });
  }
  if (made.length) log(`Sign-ins created for ${made.length} instructor${made.length === 1 ? '' : 's'}`);
  return made;
}
// a temporary password typed in the instructor form (blank = none, or a generated one for a new sign-in)
const signInPassword = (body, email) => {
  const pw = String(body.password || '');
  if (pw && !email) throw new HttpError(422, 'Fix the highlighted fields.', { email: 'Add their email first: it’s what they sign in with.' });
  if (pw && passwordProblem(pw, email)) throw new HttpError(422, 'Fix the highlighted fields.', { password: passwordProblem(pw, email) });
  return pw;
};
// the learners on a course's batches: each is enrolled in the course (so it shows in their learner account), and
// an email that isn't a user yet becomes a Learner sign-in (temporary password, shown once to whoever saved)
function batchAccounts(d, c) {
  const made = [], today = isoDay(Date.now());
  let enrolled = 0;
  for (const b of c.schedules || []) for (const email of b.learners || []) {
    const st = ensureStudent(d, { email, name: '' }, uid);
    const u = d.users.find((x) => x.email.toLowerCase() === email);
    if (!u) {
      const password = tempPassword();
      d.users.unshift({ id: uid('u'), email, name: st.name, role: 'Learner', status: 'Password pending', instructorId: '', studentId: st.id, passwordHash: hash(password) });
      made.push({ name: st.name, email, password });
    } else if (u.role === 'Learner' && !u.studentId) u.studentId = st.id;
    const e = d.enrollments.find((x) => x.studentId === st.id && x.courseId === c.id);
    if (e) { e.batchId ||= b.id; continue; }
    d.enrollments.push({ id: uid('en'), studentId: st.id, courseId: c.id, enrolled: today, progress: 0, completed: '', lastActive: today, amount: 0, done: [], source: 'batch', batchId: b.id });
    enrolled++;
  }
  if (made.length) log(`Learner sign-ins created for ${made.length} email${made.length === 1 ? '' : 's'} on the batches of ${c.code}`);
  if (enrolled) log(`${enrolled} learner${enrolled === 1 ? '' : 's'} enrolled in ${c.code} from its batches`);
  return made;
}
// sign-ins for the instructors who don't have one yet
app.post('/api/instructors/accounts', wrap(() => { const d = load(), accounts = instructorAccounts(d, d.instructors); save(); return { accounts }; }));
app.post('/api/instructors', wrap((req, res) => {
  const x = { phone: '', location: '', travel: '', vendor: '', platforms: [], portfolio: '', product: '', skills: '', canTeach: '', languages: '', rating: '', comments: '', ...cleanInstructor(req.body) };
  validateInstructor(x);
  const chosen = signInPassword(req.body, x.email);
  x.id = uid('i'); x.created = isoDay(Date.now()); load().instructors.unshift(x); log(`Instructor ${x.name} added`); assignCourses(load(), x.name, req.body.assign);
  const accounts = instructorAccounts(load(), [x], chosen); save();
  res.status(201); return { ...x, accounts };
}));
// an instructor's certificate signature (admins); instructors set their own on /teach/profile
const signatureOwner = (req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can do that.');
  const x = load().instructors.find((r) => r.id === req.params.id);
  if (!x) throw new HttpError(404, 'Instructor not found.');
  return x;
};
app.get('/api/instructors/:id/signature', wrap((req) => ({ signature: signatureOwner(req).signature || '' })));
app.put('/api/instructors/:id/signature', wrap((req) => {
  const x = signatureOwner(req), sig = String(req.body.signature || ''), problem = signatureProblem(sig);
  if (problem) throw new HttpError(422, problem);
  x.signature = sig; log(`Certificate signature for ${x.name} ${sig ? 'updated' : 'removed'}`); save();
  return { signature: sig };
}));
app.get('/api/instructors/:id/certificate-preview', (req, res, next) => {
  try {
    const x = signatureOwner(req), course = teachingCourses(load(), x)[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Certificate preview.pdf"');
    certificatePdf({ number: 'ATL-PREVIEW', student: 'Sample Learner', course: course?.name || 'Course name', completed: isoDay(Date.now()), signers: [{ name: x.name, title: 'Instructor', signature: x.signature || '' }] }, res);
  } catch (e) { next(e); }
});
app.put('/api/instructors/:id', wrap((req) => {
  const d = load(), x = d.instructors.find((r) => r.id === req.params.id);
  if (!x) throw new HttpError(404, 'Instructor not found.');
  const next = { ...x, ...cleanInstructor(req.body) };
  validateInstructor(next, x.id);
  const pw = signInPassword(req.body, next.email);
  if (next.name !== x.name) d.courses.forEach((c) => { c.instructors = c.instructors.map((n) => (n === x.name ? next.name : n)); });
  Object.assign(x, next); log(`Instructor ${x.name} updated`); assignCourses(d, x.name, req.body.assign);
  // a new temporary password: reset their sign-in (they choose their own at next sign-in), or make one if they have none
  let accounts = [];
  if (pw) {
    const u = d.users.find((y) => y.instructorId === x.id) || d.users.find((y) => y.email.toLowerCase() === x.email.toLowerCase());
    if (u?.role === 'Admin') throw new HttpError(422, 'This email belongs to an admin. Change that password on the Users page.');
    if (u) {
      Object.assign(u, { passwordHash: hash(pw), status: u.status === 'Pending approval' ? u.status : 'Password pending', instructorId: u.role === 'Instructor' ? x.id : u.instructorId });
      log(`Temporary password set for ${u.email}`); securityEvent(d, 'Temporary password set', { email: u.email, ip: clientIp(req), detail: `by ${req.user.email}` });
      accounts = [{ name: x.name, email: u.email, password: pw }];
    } else accounts = instructorAccounts(d, [x], pw);
  }
  save();
  return { ...x, accounts };
}));
app.delete('/api/instructors/:id', wrap((req, res) => {
  const d = load(), i = d.instructors.findIndex((r) => r.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'Instructor not found.');
  const [x] = d.instructors.splice(i, 1);
  d.courses.forEach((c) => { c.instructors = c.instructors.filter((n) => n !== x.name); });
  d.users.forEach((u) => { if (u.instructorId === x.id) u.instructorId = ''; });
  log(`Instructor ${x.name} deleted`); save();
  res.status(204).end();
}));
// two profiles that are the same person (a typo, a missing space): everything of `:id` moves to `into`, and the
// details `into` lacks are filled from it; then `:id` is removed. A backup of all data is saved first.
app.post('/api/instructors/:id/merge', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can merge instructors.');
  const d = load(), gone = d.instructors.find((x) => x.id === req.params.id), keep = d.instructors.find((x) => x.id === String(req.body.into || ''));
  if (!gone || !keep || gone.id === keep.id) throw new HttpError(404, 'Choose two different instructors.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  backup(`atlas.backup-before-merge-${stamp}.json`);
  mergeInstructor(d, gone, keep);
  log(`Instructor ${gone.name} merged into ${keep.name}`); save();
  return keep;
}));
/** Moves everything of `gone` (courses, batches, sign-in, messages, reviews, resources, details) to `keep`, then removes `gone`. */
function mergeInstructor(d, gone, keep) {
  const same = (n) => String(n || '').trim().toLowerCase() === gone.name.trim().toLowerCase();
  for (const c of d.courses) {
    if ((c.instructors || []).some(same)) c.instructors = [...new Set(c.instructors.map((n) => (same(n) ? keep.name : n)))];
    for (const b of c.schedules || []) if (same(b.instructor)) b.instructor = keep.name;
  }
  for (const u of d.users) if (u.instructorId === gone.id) u.instructorId = keep.id;
  for (const t of d.threads || []) if (t.instructorId === gone.id) t.instructorId = keep.id;
  for (const r of d.resources || []) if (r.instructorId === gone.id) r.instructorId = keep.id;
  for (const v of d.reviews || []) if (v.instructorId === gone.id) Object.assign(v, { instructorId: keep.id, instructorName: keep.name });
  for (const e of d.enrollments || []) if (e.assignedBy === gone.id) e.assignedBy = keep.id;
  // details: keep's own win; empty ones come from the other profile, lists are joined
  for (const k of ['email', 'phone', 'location', 'travel', 'vendor', 'portfolio', 'product', 'languages', 'rating', 'signature']) if ((keep[k] === '' || keep[k] == null) && gone[k]) keep[k] = gone[k];
  keep.platforms = [...new Set([...(keep.platforms || []), ...(gone.platforms || [])])];
  for (const k of ['skills', 'canTeach']) keep[k] = [...new Set(splitList(keep[k]).concat(splitList(gone[k])))].join(', ');
  if (gone.comments && !String(keep.comments || '').includes(gone.comments)) keep.comments = [keep.comments, gone.comments].filter(Boolean).join('\n');
  keep.extra = { ...(gone.extra || {}), ...(keep.extra || {}) };
  keep.notSame = (keep.notSame || []).filter((x) => x !== gone.id);
  d.instructors = d.instructors.filter((x) => x.id !== gone.id);
  for (const x of d.instructors) if (x.notSame) x.notSame = x.notSame.filter((y) => y !== gone.id);
}

/** Profiles with exactly the same name become one (the one with an email, or the older one, is kept), unless both
 *  have different emails or were marked "not the same". Returns how many were merged. */
function mergeSameNames(d) {
  let merged = 0;
  for (let again = true; again; ) {
    again = false;
    for (const a of d.instructors) {
      const b = d.instructors.find((o) => o.id !== a.id && o.name.trim().toLowerCase() === a.name.trim().toLowerCase()
        && !(a.email && o.email && a.email.toLowerCase() !== o.email.toLowerCase()) && !(a.notSame || []).includes(o.id));
      if (!b) continue;
      const keep = a.email || !b.email ? a : b, gone = keep === a ? b : a;
      mergeInstructor(d, gone, keep); merged++; again = true; break;
    }
  }
  if (merged) log(`${merged} instructor profile${merged === 1 ? '' : 's'} with the same name merged`);
  return merged;
}
// "not the same person": remembered on both, so the question isn't asked again
app.post('/api/instructors/:id/not-same', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can do that.');
  const d = load(), a = d.instructors.find((x) => x.id === req.params.id), b = d.instructors.find((x) => x.id === String(req.body.other || ''));
  if (!a || !b) throw new HttpError(404, 'Instructor not found.');
  a.notSame = [...new Set([...(a.notSame || []), b.id])]; b.notSame = [...new Set([...(b.notSame || []), a.id])];
  save(); return { ok: true };
}));
// several instructors at once (Instructors page); a backup of all data is saved first
app.post('/api/instructors/bulk-delete', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can delete instructors.');
  const d = load(), ids = new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : []);
  const gone = d.instructors.filter((x) => ids.has(x.id));
  if (!gone.length) throw new HttpError(422, 'Select at least one instructor.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  const kept = `atlas.backup-before-delete-${stamp}.json`;
  backup(kept);
  const names = new Set(gone.map((x) => x.name));
  d.instructors = d.instructors.filter((x) => !ids.has(x.id));
  // courses keep the names unless asked (so re-importing the same people reconnects them to their courses)
  if (req.body.courses) d.courses.forEach((c) => { c.instructors = (c.instructors || []).filter((n) => !names.has(n)); });
  // their sign-ins go too when asked (never an admin's); otherwise they're just unlinked
  const before = d.users.length;
  if (req.body.accounts) d.users = d.users.filter((u) => !(u.role === 'Instructor' && ids.has(u.instructorId)));
  d.users.forEach((u) => { if (ids.has(u.instructorId)) u.instructorId = ''; });
  const accounts = before - d.users.length;
  log(`${gone.length} instructor${gone.length === 1 ? '' : 's'} deleted${accounts ? ` with ${accounts} sign-in${accounts === 1 ? '' : 's'}` : ''}: ${gone.slice(0, 5).map((x) => x.name).join(', ')}${gone.length > 5 ? ` and ${gone.length - 5} more` : ''}`); save();
  return { deleted: gone.length, accounts, backup: kept };
}));

/* ---------- Users ---------- */
app.get('/api/users', wrap(() => load().users.map(publicUser)));
app.post('/api/users', wrap((req, res) => {
  const d = load(), email = String(req.body.email || '').trim(), name = String(req.body.name || '').trim(), password = String(req.body.password || ''), f = {};
  if (!email) f.email = 'Email is required.'; else if (!EMAIL.test(email)) f.email = 'Enter an email like name@company.com.';
  else if (d.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) f.email = 'This email is already registered.';
  if (!password) f.password = 'Temporary password is required.'; else if (passwordProblem(password, email)) f.password = passwordProblem(password, email);
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  const inst = d.instructors.find((i) => i.email.toLowerCase() === email.toLowerCase());
  const u = { id: uid('u'), email, name: name || inst?.name || '', role: 'Instructor', status: 'Password pending', instructorId: inst?.id || '', passwordHash: hash(password) };
  d.users.unshift(u); log(`User ${email} created`); securityEvent(d, 'Account created', { email, ip: clientIp(req), detail: `by ${req.user.email}` }); save();
  res.status(201); return publicUser(u);
}));
app.put('/api/users/:id', wrap((req) => {
  const d = load(), u = d.users.find((x) => x.id === req.params.id), f = {};
  if (!u) throw new HttpError(404, 'User not found.');
  const email = String(req.body.email ?? u.email).trim(), role = req.body.role ?? u.role, instructorId = role === 'Instructor' ? String(req.body.instructorId ?? u.instructorId ?? '') : '';
  if (!EMAIL.test(email)) f.email = 'Enter an email like name@company.com.';
  else if (d.users.some((x) => x.id !== u.id && x.email.toLowerCase() === email.toLowerCase())) f.email = 'This email is already registered.';
  if (!ROLES.includes(role)) f.role = 'Choose Admin, Instructor or Learner.';
  if (role === 'Instructor' && !instructorId) f.instructorId = 'Choose the instructor profile this user signs in as.';
  if (u.role === 'Admin' && role !== 'Admin' && d.users.filter((x) => x.role === 'Admin').length < 2) f.role = 'Keep at least one admin. Give another user the Admin role first.';
  const password = String(req.body.password || ''); // optional: admin sets a new temporary password
  if (password && passwordProblem(password, email)) f.password = passwordProblem(password, email);
  if (Object.keys(f).length) throw new HttpError(422, 'Fix the highlighted fields.', f);
  if (role !== u.role) securityEvent(d, 'Role changed', { email: u.email, ip: clientIp(req), detail: `${u.role} → ${role} by ${req.user.email}` });
  if (password) securityEvent(d, 'Temporary password set', { email: u.email, ip: clientIp(req), detail: `by ${req.user.email}` });
  Object.assign(u, { email, name: String(req.body.name ?? u.name).trim(), role, instructorId });
  if (role === 'Learner') u.studentId = ensureStudent(d, { email, name: u.name }, uid).id;
  if (password) Object.assign(u, { passwordHash: hash(password), status: u.status === 'Pending approval' ? u.status : 'Password pending' });
  log(`User ${u.name || u.email} updated`); save();
  return publicUser(u);
}));
app.post('/api/users/:id/approve', wrap((req) => {
  const u = load().users.find((x) => x.id === req.params.id);
  if (!u) throw new HttpError(404, 'User not found.');
  if (u.status !== 'Pending approval') throw new HttpError(409, 'This account is already approved.');
  u.status = 'Active'; log(`User ${u.name || u.email} approved`); save();
  return publicUser(u);
}));
app.delete('/api/users/:id', wrap((req, res) => {
  const d = load(), i = d.users.findIndex((x) => x.id === req.params.id);
  if (i < 0) throw new HttpError(404, 'User not found.');
  if (d.users[i].role === 'Admin' && d.users.filter((x) => x.role === 'Admin').length < 2) throw new HttpError(409, 'You can’t delete the last admin.');
  const [u] = d.users.splice(i, 1); log(`User ${u.name || u.email} deleted`); save();
  res.status(204).end();
}));

/* ---------- Activity / maintenance ---------- */
// the site-wide activity log names every course and person, so it is for admins (instructors have their own notifications)
app.get('/api/activity', wrap((req) => (req.user.role === 'Admin' ? load().activity : [])));
app.post('/api/activity/read', wrap((req) => { if (req.user.role !== 'Admin') return { ok: true }; load().activity.forEach((a) => (a.read = true)); save(); return { ok: true }; }));
// the old one-click reset is gone: resetting now happens on Site Settings (typed confirmation, backup first)
app.post('/api/reset', wrap(() => { throw new HttpError(410, 'Reset moved to Site Settings, where a backup is kept first.'); }));

/* ---------- Import ---------- */
app.get('/api/import/sample/:kind', (req, res) => {
  const kind = req.params.kind === 'instructors' ? 'instructors' : 'courses';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${kind === 'courses' ? 'ATLAS_Sample_Courses_and_Lessons' : 'ATLAS_Sample_Instructors'}.xlsx"`);
  res.send(sampleWorkbook(kind));
});
/* ---------- Added fields (new spreadsheet columns kept in Hazdemy) ---------- */
app.get('/api/custom-fields', wrap(() => { const d = load(); return { courses: customFieldsOf(d, 'courses'), instructors: customFieldsOf(d, 'instructors') }; }));
app.put('/api/custom-fields/:kind/:key', wrap((req) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can change fields.');
  const d = load(), f = ['courses', 'instructors'].includes(req.params.kind) && customFieldsOf(d, req.params.kind).find((x) => x.key === req.params.key);
  if (!f) throw new HttpError(404, 'Field not found.');
  const label = String(req.body.label || '').trim().slice(0, 60);
  if (!label) throw new HttpError(422, 'Fix the highlighted fields.', { label: 'Enter a name for the field.' });
  f.label = label; log(`Field renamed to ${label}`); save(); return f;
}));
app.delete('/api/custom-fields/:kind/:key', wrap((req, res) => {
  if (req.user.role !== 'Admin') throw new HttpError(403, 'Only admins can change fields.');
  const d = load(), kind = req.params.kind, list = ['courses', 'instructors'].includes(kind) && customFieldsOf(d, kind);
  const i = list ? list.findIndex((x) => x.key === req.params.key) : -1;
  if (i < 0) throw new HttpError(404, 'Field not found.');
  const [f] = list.splice(i, 1);
  for (const r of d[kind]) if (r.extra) delete r.extra[f.key];
  log(`Field ${f.label} removed from ${kind}`); save(); res.status(204).end();
}));

app.post('/api/import/:kind', upload.single('file'), wrap((req) => {
  const kind = req.params.kind;
  if (!['courses', 'instructors'].includes(kind)) throw new HttpError(404, 'Unknown import type.');
  if (!req.file) throw new HttpError(400, 'Choose a file to import.');
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(req.file.originalname)) throw new HttpError(400, 'Use an Excel (.xlsx, .xls) or CSV file.');
  let sheets;
  try { sheets = readWorkbook(req.file.buffer, req.file.originalname); } catch { throw new HttpError(400, `${req.file.originalname} couldn’t be read. Open it in Excel, save it again as .xlsx, and retry.`); }
  const d = load();
  const replace = req.body.replace === 'true' && kind === 'courses';
  let addFields = []; try { const a = JSON.parse(req.body.addFields || '[]'); if (Array.isArray(a)) addFields = a.map(String).slice(0, 50); } catch { /* none */ }
  let fixes = {}; try { const f = JSON.parse(req.body.fixes || '{}'); if (f && typeof f === 'object' && !Array.isArray(f)) fixes = f; } catch { /* none */ }
  let force = []; try { const a = JSON.parse(req.body.force || '[]'); if (Array.isArray(a)) force = a; } catch { /* none */ }
  let prefer = []; try { const a = JSON.parse(req.body.prefer || '[]'); if (Array.isArray(a)) prefer = a; } catch { /* none */ }
  let sameAs = {}; try { const m = JSON.parse(req.body.sameAs || '{}'); if (m && typeof m === 'object' && !Array.isArray(m)) sameAs = m; } catch { /* none */ }
  let nameMap = {}; try { const m = JSON.parse(req.body.nameMap || '{}'); if (m && typeof m === 'object' && !Array.isArray(m)) nameMap = m; } catch { /* none */ }
  const result = analyse(kind, sheets, d, { replace, sheet: req.body.sheet || null, filename: req.file.originalname, addFields, fixes, force, prefer });
  if (result.error) throw new HttpError(422, result.error);
  // preview: every row, with its spreadsheet row number, and every lesson row
  if (req.body.commit !== 'true') {
    const { goodRows, fixedRows, incompleteRows, ...rest } = result;
    // instructor names in the sheet that look like someone already in Hazdemy (or like another new name in the sheet)
    const nameChecks = [];
    if (kind === 'courses') {
      const known = d.instructors.map((x) => x.name), isKnown = (n) => known.some((k) => k.trim().toLowerCase() === n.toLowerCase());
      const counts = new Map();
      for (const c of result.good) for (const n of c.instructors || []) { const t = String(n).trim(); if (t) counts.set(t, (counts.get(t) || 0) + 1); }
      const fresh = [...counts.keys()].filter((n) => !isKnown(n));
      for (const n of fresh) {
        const like = known.find((k) => namesLookAlike(n, k)) || fresh.filter((m) => m !== n && namesLookAlike(n, m) && counts.get(m) >= counts.get(n)).sort((a, b) => counts.get(b) - counts.get(a))[0];
        if (like) nameChecks.push({ name: n, like, courses: counts.get(n), likeKnown: isKnown(like) });
      }
    }
    if (kind === 'instructors') {
      const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
      result.good.forEach((x, i) => {
        if (d.instructors.some((o) => same(o.name, x.name))) { rest.updates = (rest.updates || 0) + 1; return; } // same name: filled in automatically
        const like = d.instructors.find((o) => namesLookAlike(x.name, o.name));
        if (like) nameChecks.push({ row: goodRows[i], name: x.name, email: x.email, like: like.name, likeId: like.id, likeEmail: like.email || '', exact: false });
      });
    }
    return { ...rest, nameChecks, good: result.good.map((g, i) => ({ ...g, row: goodRows[i], fixed: fixedRows[goodRows[i]], incomplete: incompleteRows[goodRows[i]] })), goodCount: result.good.length, badCount: result.bad.length,
      lessons: result.lessons && { ...result.lessons, by: undefined, rows: Object.entries(result.lessons.by).flatMap(([code, list]) => list.map((l) => ({ code: result.good.find((c) => c.code.toLowerCase() === code)?.code || code, ...l }))) } };
  }
  // commit
  let lessonsAdded = 0, accounts = [];
  // the rows and columns ticked on the import page (all of them when not sent); the required fields always stay
  const list = (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch { return null; } };
  const pickRows = list(req.body.rows), pickCols = list(req.body.columns);
  const rowOf = new Map(result.good.map((g, i) => [g, result.goodRows[i]])); // each row's spreadsheet row, before any are left out
  if (pickRows) { const want = new Set(pickRows.map(Number)); result.good = result.good.filter((_, i) => want.has(result.goodRows[i])); }
  if (pickCols) {
    const keep = new Set([...pickCols.map(String), ...(kind === 'courses' ? ['code', 'name'] : ['name', 'email'])]);
    const blank = kind === 'courses' ? blankCourse() : { platforms: [] };
    for (const r of result.good) for (const k of result.columns) if (!keep.has(k)) { if (k.startsWith('cf:')) delete r.extra?.[k.slice(3)]; else r[k] = blank[k] ?? ''; }
  }
  if (!result.good.length && !(kind === 'courses' && result.lessons?.count)) throw new HttpError(422, 'Select at least one row to import.');
  // names answered "same person" on the import page are written as that person's name
  if (kind === 'courses') for (const c of result.good) if (c.instructors?.length) c.instructors = [...new Set(c.instructors.map((n) => String(nameMap[String(n).trim()] || n).trim()))];
  // new columns ticked on the import page become fields (only the ones still ticked as columns)
  const kept = pickCols ? new Set(pickCols.map(String)) : null;
  for (const f of result.customFields.filter((x) => x.isNew && (!kept || kept.has(x.key)))) {
    const list = customFieldsOf(d, kind), key = f.key.slice(3);
    if (!list.some((x) => x.key === key)) { list.push({ key, label: f.label }); log(`New ${kind === 'courses' ? 'course' : 'instructor'} field added from ${req.file.originalname}: ${f.label}`); }
  }
  if (kind === 'courses') {
    if (replace) d.courses = [];
    result.good.slice().reverse().forEach((c) => { c.id = uid('c'); d.courses.unshift(c); });
    if (result.lessons) for (const [code, arr] of Object.entries(result.lessons.by)) {
      const c = d.courses.find((x) => String(x.code).toLowerCase() === code);
      if (c) arr.forEach(({ order, ...l }) => { c.lessons.push({ id: uid('l'), ...l }); lessonsAdded++; });
    }
    log(`${replace ? 'Course catalog replaced: ' : ''}${result.good.length} courses${lessonsAdded ? ` and ${lessonsAdded} lessons` : ''} imported from ${req.file.originalname}`);
    syncInstructors(d); mergeSameNames(d);
  } else {
    // rows answered "same person" on the import page update that profile (it keeps its name, so its courses stay linked)
    let updated = 0;
    const added = [];
    for (const x of result.good.slice().reverse()) {
      const into = d.instructors.find((o) => o.id === sameAs[rowOf.get(x)]) || d.instructors.find((o) => o.name.trim().toLowerCase() === String(x.name).trim().toLowerCase() && !(o.email && x.email && o.email.toLowerCase() !== x.email.toLowerCase()));
      if (into) {
        for (const [k, v] of Object.entries(x)) if (k !== 'name' && k !== 'id' && v !== '' && v != null && !(Array.isArray(v) && !v.length)) into[k] = k === 'extra' ? { ...(into.extra || {}), ...v } : v;
        updated++; added.push(into);
      } else { x.id = uid('i'); d.instructors.unshift(x); added.push(x); }
    }
    mergeSameNames(d);
    log(`${result.good.length - updated} instructors imported${updated ? ` and ${updated} updated` : ''} from ${req.file.originalname}`);
    accounts = instructorAccounts(d, added);
  }
  save();
  return { imported: result.good.length, lessonsAdded, replace, accounts };
}));

/* ---------- Course outline documents (.docx / .doc) ---------- */
// Step 1 parses every file and returns a preview; step 2 applies the ones the user confirms.
// Uploaded files wait in memory between the two steps; the originals are kept next to the data file.
const OUTLINE_DIR = path.join(path.dirname(DATA_FILE), 'outlines');
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 50 } });
const pendingDocs = new Map(); // token -> { buffer, filename, parsed, at }
const safeName = (n) => path.basename(n).replace(/[^\w.\-() ]+/g, '_').slice(-120);

app.post('/api/outlines/parse', docUpload.array('files', 50), wrap(async (req) => {
  if (!req.files?.length) throw new HttpError(400, 'Choose one or more Word documents.');
  for (const [t, p] of pendingDocs) if (Date.now() - p.at > 30 * 6e4) pendingDocs.delete(t);
  const courses = visibleCourses(req.user); // an instructor's outline can only be matched to their own courses
  const items = [];
  for (const f of req.files) {
    const filename = Buffer.from(f.originalname, 'latin1').toString('utf8'); // multer reads names as latin1
    if (!/\.docx?$/i.test(filename)) { items.push({ filename, error: 'Not a Word document (.docx or .doc).' }); continue; }
    try {
      const blocks = await readDocument(f.buffer, filename);
      const parsed = parseOutline(blocks);
      const token = crypto.randomUUID();
      pendingDocs.set(token, { buffer: f.buffer, filename, parsed, at: Date.now() });
      const warnings = [];
      if (!parsed.topics.length) warnings.push('No topics or modules found.');
      if (!parsed.objectives.length) warnings.push('No objectives found.');
      items.push({ token, filename, parsed, match: matchCourse(parsed, filename, courses, blocks.map((b) => b.text).join(' ')), warnings });
    } catch (e) {
      items.push({ filename, error: /Word document/.test(e.message) ? e.message : `${filename} couldn’t be read. Open it in Word, save it as .docx, and try again.` });
    }
  }
  return { items };
}));

/** Keeps an uploaded outline's Word file with the course and links it as the course outline. */
function attachOutline(c, p) {
  const dir = path.join(OUTLINE_DIR, c.id), name = safeName(p.filename);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), p.buffer);
  c.outline = `/api/outlines/file/${c.id}/${encodeURIComponent(name)}`;
  if (!c.outlineStatus || ['Missing', 'Not Yet Scoped'].includes(c.outlineStatus)) c.outlineStatus = 'Draft';
}

// "New course" form: read one Word outline into the form without saving anything. The returned token attaches
// the file to the course when it's created (POST /api/courses with outlineToken).
app.post('/api/outlines/fill', docUpload.single('file'), wrap(async (req) => {
  if (!req.file) throw new HttpError(400, 'Choose a Word document.');
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  if (!/\.docx?$/i.test(filename)) throw new HttpError(422, 'Choose a Word document (.docx or .doc).');
  let parsed;
  try { parsed = parseOutline(await readDocument(req.file.buffer, filename)); } catch (e) { throw new HttpError(422, /Word document/.test(e.message) ? e.message : `${filename} couldn’t be read. Open it in Word, save it as .docx, and try again.`); }
  for (const [t, x] of pendingDocs) if (Date.now() - x.at > 30 * 6e4) pendingDocs.delete(t);
  const token = crypto.randomUUID();
  pendingDocs.set(token, { buffer: req.file.buffer, filename, parsed, at: Date.now() });
  const { patch, lessons } = outlineToCourse(parsed, null, uid);
  const warnings = [!parsed.topics.length && 'No topics or modules found.', !parsed.objectives.length && 'No objectives found.'].filter(Boolean);
  return { token, filename, patch, lessons, warnings };
}));

app.post('/api/outlines/apply', wrap((req) => {
  const d = load(), results = [];
  for (const it of req.body.items || []) {
    const p = pendingDocs.get(it.token);
    if (!p) { results.push({ error: 'This upload expired. Upload the file again.' }); continue; }
    let c = it.courseId ? d.courses.find((x) => x.id === it.courseId) : null;
    if (it.courseId && !c) { results.push({ filename: p.filename, error: 'That course no longer exists.' }); continue; }
    const inst = instructorOf(req.user);
    if (c && req.user.role !== 'Admin' && !(inst && teaches(inst, c))) { results.push({ filename: p.filename, error: 'You can only update courses you teach.' }); continue; }
    const created = !c;
    if (created) {
      let code = p.parsed.code || 'OUTLINE-' + (d.seq + 1);
      while (d.courses.some((x) => x.code.toLowerCase() === code.toLowerCase())) code += '-2';
      c = blankCourse({ name: p.parsed.name || p.filename.replace(/\.[^.]+$/, ''), code, status: 'Draft', instructors: inst ? [inst.name] : [] });
      c.id = uid('c');
      d.courses.unshift(c);
    }
    const { patch, lessons } = outlineToCourse(p.parsed, created ? null : c, uid);
    if (!created) { delete patch.name; delete patch.code; }
    Object.assign(c, patch);
    const mode = it.lessons || 'replace';
    if (lessons.length && mode !== 'keep') c.lessons = mode === 'append' ? [...(c.lessons || []), ...lessons] : lessons;
    attachOutline(c, p);
    c.updated = new Date().toISOString();
    pendingDocs.delete(it.token);
    results.push({ filename: p.filename, courseId: c.id, name: c.name, created, lessons: lessons.length, objectives: p.parsed.objectives.length });
  }
  const ok = results.filter((r) => !r.error);
  if (ok.length) { log(`${ok.length} course outline${ok.length > 1 ? 's' : ''} imported from Word`); save(); }
  return { results };
}));

app.get('/api/outlines/file/:id/:name', (req, res) => {
  // a course's outline file: admins, or an instructor of that course (folders are named by course id)
  const course = load().courses.find((c) => c.id === req.params.id);
  if (req.user.role !== 'Admin' && !(course && courseFor(req.user, course))) return res.status(404).json({ error: 'Outline file not found.' });
  const file = path.join(OUTLINE_DIR, path.basename(req.params.id), safeName(req.params.name));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Outline file not found.' });
  res.download(file, path.basename(file));
});

/* ---------- Learner data (admin) ---------- */
app.get('/api/learning/status', wrap(() => { const d = load(); return { sample: !!d.sampleLearning, students: d.students.length, enrollments: d.enrollments.length, reviews: d.reviews.length, sampleEnrollments: d.enrollments.filter((e) => e.sample).length }; }));
app.post('/api/learning/clear-sample', wrap(() => {
  const d = load(), removed = clearSample(d);
  log(`Sample learner data removed (${removed} enrollments)`); save();
  return { removed };
}));
const ENR_COLS = { name: /^(student|learner)?\s*name$|^student$|^learner$/, email: /e-?mail/, code: /course\s*code|^code$/, enrolled: /enrol+(ed|ment)?\s*(on|date)?$|^start/, progress: /progress/, completed: /complet(ed|ion)\s*(on|date)?$/, amount: /amount|price|paid|fee/, rating: /rating|stars?/, review: /review|comment|feedback/ };
app.get('/api/learning/sample', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ATLAS_Enrollments_template.csv"');
  res.send('Student Name,Student Email,Course Code,Enrolled On,Progress %,Completed On,Amount,Rating,Review\nJane Doe,jane.doe@company.com,HAZ-AT-008,2026-09-01,100,2026-09-20,399,5,Great course\n');
});
app.post('/api/learning/import', upload.single('file'), wrap((req) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to import.');
  let sheets;
  try { sheets = readWorkbook(req.file.buffer, req.file.originalname); } catch { throw new HttpError(400, 'That file couldn’t be read. Save it as .xlsx or .csv and try again.'); }
  const rows = sheets[0]?.rows || [];
  const hi = rows.findIndex((r) => r.some((x) => ENR_COLS.email.test(String(x).toLowerCase())) && r.some((x) => ENR_COLS.code.test(String(x).toLowerCase())));
  if (hi < 0) throw new HttpError(422, 'Add a header row with at least Student Email and Course Code.');
  const col = Object.fromEntries(Object.entries(ENR_COLS).map(([k, re]) => [k, rows[hi].findIndex((x) => re.test(String(x).trim().toLowerCase()))]));
  const d = load();
  if (req.body.replaceSample === 'true') clearSample(d);
  const day = (v) => { if (v instanceof Date) return isoDay(v); const t = Date.parse(v); return Number.isNaN(t) ? '' : isoDay(t); };
  const out = { added: 0, updated: 0, skipped: [] };
  rows.slice(hi + 1).forEach((r, k) => {
    const get = (key) => (col[key] >= 0 ? r[col[key]] : '');
    const email = String(get('email')).trim().toLowerCase(), code = String(get('code')).trim().toLowerCase();
    if (!email && !code) return;
    const c = d.courses.find((x) => String(x.code).toLowerCase() === code);
    if (!EMAIL.test(email) || !c) { out.skipped.push(`Row ${hi + k + 2}: ${!c ? `no course with code ${get('code')}` : 'missing or invalid email'}`); return; }
    let s = d.students.find((x) => x.email.toLowerCase() === email);
    if (!s) { s = { id: uid('st'), name: String(get('name')).trim() || email.split('@')[0], email, location: '', joined: day(get('enrolled')) || isoDay(Date.now()) }; d.students.push(s); }
    const completed = day(get('completed')), progress = completed ? 100 : Math.max(0, Math.min(100, Math.round(+get('progress') || 0)));
    const e = d.enrollments.find((x) => x.studentId === s.id && x.courseId === c.id && !x.sample);
    const rec = { studentId: s.id, courseId: c.id, enrolled: day(get('enrolled')) || isoDay(Date.now()), progress, completed, lastActive: completed || day(get('enrolled')) || isoDay(Date.now()), amount: get('amount') === '' ? +c.price || 0 : +get('amount') || 0 };
    if (e) { Object.assign(e, rec); out.updated++; } else { d.enrollments.push({ id: uid('en'), ...rec }); out.added++; }
    const rating = Math.round(+get('rating'));
    if (rating >= 1 && rating <= 5) {
      const v = d.reviews.find((x) => x.studentId === s.id && x.courseId === c.id && !x.sample);
      const rv = { studentId: s.id, courseId: c.id, rating, comment: String(get('review')).trim(), date: completed || rec.lastActive };
      if (v) Object.assign(v, rv); else d.reviews.push({ id: uid('rv'), ...rv, reply: '' });
    }
  });
  log(`Enrollments imported: ${out.added} added, ${out.updated} updated`); save();
  return { ...out, skipped: out.skipped.slice(0, 20), skippedCount: out.skipped.length };
}));

mountTeach(app, { wrap, HttpError, load, save, uid, log, dataDir: path.dirname(DATA_FILE) });
mountLearn(app, { wrap, HttpError, load, save, uid, log });
mountApiAdmin(app, { wrap, HttpError, load, save, uid, log });
mountAdmin(app, { wrap, HttpError, load, save, uid, log, backup, dataFile: DATA_FILE, reset, afterReset: () => { ensureAdminLogin(); ensureLearningSetup(); } });

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- Serve the built React app (npm run build) ---------- */
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 20 MB.' : err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Check the terminal for details.' : err.message, fields: err.fields });
});

/** Instructor profiles saved in the backup files next to the data, newest first (read only when a name is missing). */
/**
 * Every name teaching a course must be in the instructor list. Missing names get a basic profile built from their
 * courses, with no email until someone adds the real one (never a made-up address, never details from old backups).
 */
const missingInstructors = (d) => [...new Set(d.courses.flatMap((c) => c.instructors || []).map((n) => String(n).trim()).filter(Boolean))]
  .filter((n) => !d.instructors.some((i) => i.name.trim().toLowerCase() === n.toLowerCase()));
function syncInstructors(d) {
  const has = (n) => d.instructors.some((i) => i.name.trim().toLowerCase() === n.toLowerCase());
  const missing = missingInstructors(d);
  if (!missing.length) return [];
  const made = [];
  for (const name of missing) {
    if (has(name)) continue; // same name twice with different spacing or case
    const mine = d.courses.filter((c) => (c.instructors || []).some((n) => n.trim().toLowerCase() === name.toLowerCase()));
    const x = { id: uid('i'), name, email: '', phone: '', location: '', travel: '', vendor: [...new Set(mine.map((c) => c.vendor).filter(Boolean))].join(', '), platforms: [...new Set(mine.map((c) => c.platform).filter(Boolean))],
      portfolio: '', product: [...new Set(mine.map((c) => c.product).filter(Boolean))].slice(0, 3).join(', '), skills: '', canTeach: mine.map((c) => c.code).join(', '), languages: '', rating: '',
      comments: 'Profile created automatically because a course lists this instructor. Add the email address and details.', created: isoDay(Date.now()) };
    made.push(name);
    d.instructors.push(x);
  }
  if (made.length) log(`Added to the instructor list from courses: ${made.join(', ')}`);
  return made;
}

/**
 * One-time setup for the instructor area: every name teaching a course gets an instructor profile, and
 * (if there are no enrollments yet) sample learner data is generated. The data file is backed up first.
 */
function ensureLearningSetup() {
  const d = load();
  ensureLearning(d);
  if (d.learningReady) return;
  backup(`atlas.backup-before-instructor-area-${isoDay(Date.now())}.json`);
  const made = syncInstructors(d);
  if (!d.enrollments.length && sampleMode()) generateSample(d);
  d.learningReady = true;
  save();
  if (made.length || d.sampleLearning) console.log(`Instructor area ready${made.length ? ` (profiles created: ${made.join(', ')})` : ''}${d.sampleLearning ? ', sample learner data generated' : ''}.`);
}

await init();
load();
ensureAdminLogin();
ensureLearningSetup();
// existing courses may name instructors that aren't in the list (older data, restores): add them now, after a backup
{
  const d = load();
  if (missingInstructors(d).length) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
    backup(`atlas.backup-before-instructor-sync-${stamp}.json`);
    const made = syncInstructors(d); save();
    console.log(`Instructor list: added ${made.join(', ')}`);
  }
}
app.listen(PORT, () => console.log(`Hazdemy API running on http://localhost:${PORT}  (data: ${storage()})`));
