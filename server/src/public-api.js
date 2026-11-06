// Public course API (/api/v1/*) for the Hazdemy websites, plus the admin side that manages its keys
// (/api/admin/api-keys). Websites call it with a website key; a browser call is only answered when the page's
// address is one of that key's allowed websites. Only published courses and their public details go out.
import crypto from 'node:crypto';
import { statusTab } from './learning.js';
import { coursePdf } from './pdf.js';
import { payConfig } from './settings.js';
import { isHtml, escapeHtml, sanitizeHtml, htmlToText } from './richtext.js';
import { clientIp, isHttps } from './security.js';
import { upcomingBatches, batchTimes, publicBatch } from './schedule.js';

const LEVELS = ['Foundational', 'Intermediate', 'Advanced'];
const SORTS = ['name', 'newest', 'rating', 'popular', 'price', 'shortest', 'upcoming'];
const MAX_LIMIT = 100;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const text = (s) => (isHtml(s) ? htmlToText(s) : String(s || '')).replace(/\s+/g, ' ').trim();
// rich fields go out as safe HTML; plain text becomes paragraphs / a list when it has bullet lines
const html = (s) => {
  if (!String(s || '').trim()) return '';
  if (isHtml(s)) return sanitizeHtml(s);
  const lines = String(s).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every((l) => /^[-•*]\s*/.test(l))) return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>`;
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('');
};
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((s) => String(s).trim()).filter(Boolean);
/** "https://www.hazdemy.com/courses/" → "https://www.hazdemy.com"; '' when it isn't a web address. */
export function normalizeOrigin(s) {
  let v = String(s || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname ? u.origin.toLowerCase() : ''; } catch { return ''; }
}
const newKey = () => 'atlas_pk_' + crypto.randomBytes(18).toString('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Simple fixed-window counter kept in memory: `hit(key)` returns false once `max` is passed within `windowMs`. */
function limiter(max, windowMs) {
  const m = new Map();
  return (k) => {
    const now = Date.now(), e = m.get(k);
    if (!e || now - e.since > windowMs) { m.set(k, { n: 1, since: now }); if (m.size > 5000) for (const [x, v] of m) if (now - v.since > windowMs) m.delete(x); return true; }
    return ++e.n <= max;
  };
}

export function mountPublicApi(app, { wrap, HttpError, load, save, uid, log, sessionUser }) {
  const reads = limiter(600, 5 * 60e3), enquiries = limiter(5, 15 * 60e3);
  // call counts are kept in memory and written with the data once a minute, not on every request
  const usage = new Map();
  setInterval(() => {
    if (!usage.size) return;
    const d = load();
    for (const [id, u] of usage) { const k = (d.apiKeys || []).find((x) => x.id === id); if (k) { k.calls = (k.calls || 0) + u.n; k.lastUsed = u.last; k.lastOrigin = u.origin || k.lastOrigin || ''; } }
    usage.clear(); save();
  }, 60e3).unref();

  const activeKeys = (d) => (d.apiKeys || []).filter((k) => k.active !== false);
  const ownSite = (req, origin) => { try { const h = new URL(origin).host; return h === req.headers.host || h === req.headers['x-forwarded-host']; } catch { return false; } };

  /* CORS: answer browsers on the allowed websites, before the key check so errors are readable there too. */
  app.use('/api/v1', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const o = normalizeOrigin(origin);
      if (activeKeys(load()).some((k) => (k.origins || []).includes(o)) || ownSite(req, origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count');
      }
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
    next();
  });

  /* Key check: X-API-Key header or ?key=. A browser call must come from one of the key's websites. */
  app.use('/api/v1', (req, res, next) => {
    if (req.path === '/' || req.path === '') return next();
    const d = load(), given = String(req.get('x-api-key') || req.query.key || '').trim();
    const key = given && activeKeys(d).find((k) => safeEq(k.key, given));
    if (!key) return next(new HttpError(401, given ? 'This website key isn’t valid or has been switched off.' : 'Send a website key in the X-API-Key header or ?key=.'));
    const origin = req.headers.origin;
    if (origin && !(key.origins || []).includes(normalizeOrigin(origin))) {
      // ATLAS's own pages (the admin preview) may use any key
      const me = ownSite(req, origin) && sessionUser(req);
      if (!(me && me.role === 'Admin')) return next(new HttpError(403, `This key isn’t allowed on ${normalizeOrigin(origin) || 'this website'}. Add the website to the key in Hazdemy → Website API.`));
    }
    if (!reads(`${key.id}|${clientIp(req)}`)) return next(new HttpError(429, 'Too many requests. Wait a few minutes and try again.'));
    const u = usage.get(key.id) || { n: 0 };
    usage.set(key.id, { n: u.n + 1, last: new Date().toISOString(), origin: origin ? normalizeOrigin(origin) : u.origin });
    req.apiKey = key;
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  /** The courses this key may show: published, and inside the key's vendor/platform limits when it has any. */
  const visible = (d, key) => d.courses.filter((c) => statusTab(c.status) === 'published'
    && (!key.vendors?.length || key.vendors.some((v) => same(v, c.vendor)))
    && (!key.platforms?.length || key.platforms.some((p) => same(p, c.platform))));
  const ratings = (d) => {
    const m = new Map();
    for (const v of d.reviews || []) { const r = m.get(v.courseId) || { sum: 0, n: 0 }; r.sum += +v.rating || 0; r.n++; m.set(v.courseId, r); }
    return m;
  };
  const hoursOf = (c) => +c.hours || Math.round(((c.lessons || []).reduce((a, l) => a + (+l.mins || 0), 0) / 60) * 10) / 10 || (+c.duration ? +c.duration * 8 : 0);
  const base = (req) => `${isHttps(req) ? 'https' : 'http'}://${req.get('x-forwarded-host') || req.get('host')}`;
  const summary = (d, c, R, cur, req) => {
    const r = R.get(c.id), next = upcomingBatches(c)[0];
    return {
      id: c.id, code: c.code || '', name: c.name || '', vendor: c.vendor || '', platform: c.platform || '', portfolio: c.portfolio || '', product: c.product || '',
      level: LEVELS.includes(c.skill) ? c.skill : 'Foundational', delivery: c.delivery || '', durationDays: +c.duration || 0, hours: hoursOf(c),
      price: c.price === '' || c.price == null || isNaN(+c.price) ? null : +c.price, currency: cur,
      rating: r ? Math.round((r.sum / r.n) * 10) / 10 : null, ratings: r ? r.n : 0, learners: (d.enrollments || []).filter((e) => e.courseId === c.id).length,
      nextBatch: next ? { startDate: next.startDate, startUtc: next.startUtc, endUtc: next.endUtc, timeZone: next.timeZone, times: batchTimes(next), mode: next.mode, status: next.status } : null,
      customFor: c.customFor || '', baseCourse: (() => { const o = c.baseCourse && visible(d, req.apiKey).find((x) => x.id === c.baseCourse); return o ? { id: o.id, code: o.code, name: o.name } : null; })(),
      summary: text(c.description).slice(0, 240), updated: c.updated || c.created || '',
      links: { self: `${base(req)}/api/v1/courses/${encodeURIComponent(c.id)}`, outlinePdf: `${base(req)}/api/v1/courses/${encodeURIComponent(c.id)}/outline.pdf` }
    };
  };
  const find = (d, key, ref) => visible(d, key).find((c) => c.id === ref || same(c.code, ref));

  app.get('/api/v1', wrap((req) => ({
    name: 'Hazdemy course API', version: 1,
    endpoints: ['GET /api/v1/courses', 'GET /api/v1/courses/{id or code}', 'GET /api/v1/courses/{id or code}/outline.pdf', 'GET /api/v1/filters', 'POST /api/v1/enquiries']
  })));

  app.get('/api/v1/courses', wrap((req, res) => {
    const d = load(), R = ratings(d), cur = payConfig(d).currency || 'USD', Q = req.query;
    const words = String(Q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const level = LEVELS.find((l) => same(l, Q.level)) || ({ beginner: 'Foundational' })[String(Q.level || '').toLowerCase()];
    let rows = visible(d, req.apiKey).filter((c) =>
      (!Q.vendor || same(c.vendor, Q.vendor)) && (!Q.platform || same(c.platform, Q.platform)) && (!Q.product || same(c.product, Q.product))
      && (!Q.portfolio || same(c.portfolio, Q.portfolio)) && (!Q.delivery || same(c.delivery, Q.delivery)) && (!Q.level || c.skill === level)
      && (!Q.scheduled || upcomingBatches(c).length)
      && (!Q.custom || (Q.custom === '0' ? !c.customFor : !!c.customFor)) && (!Q.client || same(c.customFor, Q.client))
      && (!words.length || words.every((w) => [c.code, c.ibmCode, c.name, c.vendor, c.platform, c.portfolio, c.product, c.customFor, text(c.description)].join(' ').toLowerCase().includes(w))));
    const sort = SORTS.includes(Q.sort) ? Q.sort : 'name';
    const rate = (c) => { const r = R.get(c.id); return r ? r.sum / r.n : 0; };
    const nextStart = (c) => upcomingBatches(c)[0]?.startUtc;
    const learners = new Map(); for (const e of d.enrollments || []) learners.set(e.courseId, (learners.get(e.courseId) || 0) + 1);
    const by = {
      name: (a, b) => String(a.name).localeCompare(String(b.name)), newest: (a, b) => String(b.created || '').localeCompare(String(a.created || '')),
      rating: (a, b) => rate(b) - rate(a) || (R.get(b.id)?.n || 0) - (R.get(a.id)?.n || 0), popular: (a, b) => (learners.get(b.id) || 0) - (learners.get(a.id) || 0),
      price: (a, b) => (+a.price || 0) - (+b.price || 0), shortest: (a, b) => hoursOf(a) - hoursOf(b),
      upcoming: (a, b) => (nextStart(a) || '9999').localeCompare(nextStart(b) || '9999')
    }[sort];
    rows = rows.sort((a, b) => by(a, b) || String(a.name).localeCompare(String(b.name)));
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(Q.limit, 10) || 20)), offset = Math.max(0, parseInt(Q.offset, 10) || 0);
    res.setHeader('X-Total-Count', String(rows.length));
    return { total: rows.length, limit, offset, sort, items: rows.slice(offset, offset + limit).map((c) => summary(d, c, R, cur, req)) };
  }));

  app.get('/api/v1/filters', wrap((req) => {
    const rows = visible(load(), req.apiKey);
    // the most common spelling of each value, counted case-insensitively
    const count = (k) => {
      const m = new Map();
      for (const c of rows) { const v = String(c[k] || '').trim(); if (!v) continue; const e = m.get(v.toLowerCase()) || { names: new Map(), count: 0 }; e.count++; e.names.set(v, (e.names.get(v) || 0) + 1); m.set(v.toLowerCase(), e); }
      return [...m.values()].map((e) => ({ value: [...e.names].sort((a, b) => b[1] - a[1])[0][0], count: e.count })).sort((a, b) => a.value.localeCompare(b.value));
    };
    return { total: rows.length, vendors: count('vendor'), platforms: count('platform'), products: count('product'), deliveries: count('delivery'), clients: count('customFor'),
      levels: LEVELS.map((l) => ({ value: l, count: rows.filter((c) => (LEVELS.includes(c.skill) ? c.skill : 'Foundational') === l).length })).filter((l) => l.count) };
  }));

  app.get('/api/v1/courses/:ref', wrap((req) => {
    const d = load(), c = find(d, req.apiKey, req.params.ref);
    if (!c) throw new HttpError(404, 'Course not found.');
    const people = (c.instructors || []).map((n) => {
      const i = d.instructors.find((x) => same(x.name, n));
      return { name: String(n).trim(), title: i ? [i.product, (i.platforms || [])[0]].filter(Boolean)[0] || 'Instructor' : 'Instructor', location: i?.location || '' };
    }).filter((p) => p.name);
    return {
      ...summary(d, c, ratings(d), payConfig(d).currency || 'USD', req),
      description: html(c.description), objectives: html(c.objectives), topics: html(c.topics), prerequisites: html(c.prereqs), audience: html(c.persona),
      certification: text(c.certification), badge: text(c.badge), learningPath: text(c.learningPath), labs: text(c.labConfig),
      instructors: people,
      // upcoming batches: local times in the batch's own zone, plus the first class in UTC for converting to any zone
      schedule: upcomingBatches(c).map(publicBatch).map((b) => ({ ...b, times: batchTimes(b) })),
      outline: (c.lessons || []).map((l) => ({ day: l.day || '', title: l.title || '', minutes: +l.mins || 0 }))
    };
  }));

  app.get('/api/v1/courses/:ref/outline.pdf', (req, res, next) => {
    const c = find(load(), req.apiKey, req.params.ref);
    if (!c) return next(new HttpError(404, 'Course not found.'));
    const name = `${c.code} - ${c.name}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    try { coursePdf(c, res); } catch (e) { next(e); }
  });

  /* "Get details / enquire" form on the websites. They land in Website API → Enquiries. */
  app.post('/api/v1/enquiries', wrap((req) => {
    const b = req.body || {};
    if (String(b.website || '').trim()) return { ok: true }; // hidden trap field that only bots fill in
    const d = load(), name = String(b.name || '').trim().slice(0, 120), email = String(b.email || '').trim().slice(0, 200);
    const errors = {};
    if (!name) errors.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (b.phone && !/^\+?[\d\s().-]{7,20}$/.test(String(b.phone).trim())) errors.phone = 'Enter a phone number like +91 98765 43210.';
    if (Object.keys(errors).length) throw new HttpError(422, 'Fix the highlighted fields.', errors);
    if (!enquiries(clientIp(req))) throw new HttpError(429, 'You’ve sent several requests already. Try again in a few minutes.');
    const c = b.course ? find(d, req.apiKey, String(b.course)) : null;
    const e = {
      id: uid('eq'), at: new Date().toISOString(), source: 'website', site: req.apiKey.name, origin: req.headers.origin ? normalizeOrigin(req.headers.origin) : '',
      name, email, phone: String(b.phone || '').trim().slice(0, 30), company: String(b.company || '').trim().slice(0, 160),
      courseId: c?.id || '', course: c ? `${c.code} · ${c.name}` : '',
      subject: c ? `Details request: ${c.code}` : 'Training enquiry', message: String(b.message || '').trim().slice(0, 3000)
    };
    d.enquiries ||= [];
    d.enquiries.unshift(e);
    d.enquiries = d.enquiries.slice(0, 1000);
    log(`Website enquiry from ${name} (${email}) on ${req.apiKey.name}${c ? ` about ${c.code} ${c.name}` : ''}`);
    save();
    return { ok: true, id: e.id };
  }));

  app.use('/api/v1', (req, res, next) => next(new HttpError(404, 'Not found. See GET /api/v1 for the list of endpoints.')));
}

/* ---------- Admin: website keys and the enquiries they bring in (behind the admin sign-in) ---------- */
export function mountApiAdmin(app, { wrap, HttpError, load, save, uid, log }) {
  const shape = (k) => ({ id: k.id, name: k.name, key: k.key, origins: k.origins || [], vendors: k.vendors || [], platforms: k.platforms || [], active: k.active !== false,
    created: k.created, calls: k.calls || 0, lastUsed: k.lastUsed || '', lastOrigin: k.lastOrigin || '' });
  const read = (b, errors) => {
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) errors.name = 'Give the key a name, e.g. “Hazdemy website”.';
    const raw = list(b.origins), origins = [...new Set(raw.map(normalizeOrigin).filter(Boolean))];
    const bad = raw.filter((o) => !normalizeOrigin(o));
    if (bad.length) errors.origins = `“${bad[0]}” isn’t a web address. Use e.g. https://www.hazdemy.com`;
    return { name, origins, vendors: list(b.vendors).slice(0, 30), platforms: list(b.platforms).slice(0, 30) };
  };
  const keyOf = (d, id) => { const k = (d.apiKeys || []).find((x) => x.id === id); if (!k) throw new HttpError(404, 'Key not found.'); return k; };

  app.get('/api/admin/api-keys', wrap(() => {
    const d = load();
    return { keys: (d.apiKeys || []).map(shape), enquiries: (d.enquiries || []).filter((e) => e.source === 'website').slice(0, 200) };
  }));
  app.post('/api/admin/api-keys', wrap((req, res) => {
    const d = load(), errors = {}, f = read(req.body || {}, errors);
    if (Object.keys(errors).length) throw new HttpError(422, 'Fix the highlighted fields.', errors);
    const k = { id: uid('ak'), ...f, key: newKey(), active: true, created: new Date().toISOString(), calls: 0 };
    (d.apiKeys ||= []).push(k);
    log(`Website key created: ${k.name}`); save();
    res.status(201); return shape(k);
  }));
  app.put('/api/admin/api-keys/:id', wrap((req) => {
    const d = load(), k = keyOf(d, req.params.id), errors = {};
    const f = read({ ...shape(k), ...req.body }, errors);
    if (Object.keys(errors).length) throw new HttpError(422, 'Fix the highlighted fields.', errors);
    Object.assign(k, f);
    if (typeof req.body.active === 'boolean') k.active = req.body.active;
    log(`Website key updated: ${k.name}${typeof req.body.active === 'boolean' ? (k.active ? ' (switched on)' : ' (switched off)') : ''}`); save();
    return shape(k);
  }));
  app.post('/api/admin/api-keys/:id/rotate', wrap((req) => {
    const d = load(), k = keyOf(d, req.params.id);
    k.key = newKey(); k.rotated = new Date().toISOString();
    log(`Website key replaced: ${k.name}`); save();
    return shape(k);
  }));
  app.delete('/api/admin/api-keys/:id', wrap((req) => {
    const d = load(), k = keyOf(d, req.params.id);
    d.apiKeys = d.apiKeys.filter((x) => x !== k);
    log(`Website key deleted: ${k.name}`); save();
    return { ok: true };
  }));
  app.delete('/api/admin/enquiries/:id', wrap((req) => {
    const d = load(), before = (d.enquiries || []).length;
    d.enquiries = (d.enquiries || []).filter((e) => e.id !== req.params.id);
    if (d.enquiries.length === before) throw new HttpError(404, 'Enquiry not found.');
    save(); return { ok: true };
  }));
}
