// Security helpers: response headers, a same-origin check for changes, sign-in throttling,
// the password rule and the security log shown on Site Settings.

/** Browser hardening headers on every response; the page itself also gets a Content-Security-Policy. */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  if (!req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
      // payment happens on Stripe's own hosted page (a normal navigation), so no Stripe scripts or frames are needed here
      "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:",
      "connect-src 'self'", "frame-src 'none'"
    ].join('; '));
  }
  next();
}
export const isHttps = (req) => req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

/**
 * Changes (POST/PUT/PATCH/DELETE) are only accepted from ATLAS's own pages: a browser on another site can't
 * submit forms or scripts against a signed-in user's session. Extra origins: ATLAS_ALLOWED_ORIGINS (comma separated).
 */
export function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/v1/')) return next(); // the public course API checks its own website key and allowed websites
  const origin = req.headers.origin || '', host = req.headers.host || '';
  if (!origin) return next(); // same-origin form posts from old browsers and server-to-server calls send none
  const allowed = String(process.env.ATLAS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  let ok = false;
  try {
    const o = new URL(origin);
    ok = o.host === host || o.host === req.headers['x-forwarded-host'] || allowed.includes(origin)
      // the React dev server (npm run dev) proxies /api from another localhost port and rewrites Host on the way
      || (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname));
  } catch { ok = false; }
  if (ok) return next();
  res.status(403).json({ error: 'This request came from another website and was blocked.' });
}

/** Password rule for new and changed passwords. Returns a message, or '' when the password is fine. */
export function passwordProblem(pw, email = '') {
  const p = String(pw || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (p.length > 200) return 'Use at most 200 characters.';
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Use letters and at least one number.';
  const local = String(email).split('@')[0].toLowerCase();
  if (email && (p.toLowerCase() === String(email).toLowerCase() || (local.length > 3 && p.toLowerCase().includes(local)))) return 'Don’t use your email address in the password.';
  if (/^(password|passw0rd|qwerty|letmein|welcome|admin|atlas)[\d!@#$]*$/i.test(p)) return 'That password is too easy to guess.';
  return '';
}

/**
 * Sign-in throttling, kept in memory: after `lockAfter` wrong passwords an email is locked for `lockMinutes`;
 * one network address is limited to 30 wrong attempts per 15 minutes whatever emails it tries.
 */
export function createThrottle() {
  const byEmail = new Map(), byIp = new Map();
  const IP_LIMIT = 30, IP_WINDOW = 15 * 60e3;
  return {
    blocked(email, ip) {
      const now = Date.now(), e = byEmail.get(email), i = byIp.get(ip);
      if (e?.until > now) return { who: 'account', wait: e.until - now };
      if (i && i.n >= IP_LIMIT && now - i.since < IP_WINDOW) return { who: 'network', wait: i.since + IP_WINDOW - now };
      return null;
    },
    /** A wrong password: returns true when this attempt locked the account. */
    fail(email, ip, { lockAfter = 5, lockMinutes = 15 } = {}) {
      const now = Date.now();
      const i = byIp.get(ip);
      byIp.set(ip, i && now - i.since < IP_WINDOW ? { n: i.n + 1, since: i.since } : { n: 1, since: now });
      const n = (byEmail.get(email)?.n || 0) + 1;
      if (n >= lockAfter) { byEmail.set(email, { n: 0, until: now + lockMinutes * 60e3 }); return true; }
      byEmail.set(email, { n, until: 0 });
      return false;
    },
    ok(email) { byEmail.delete(email); },
    unlock(email) { byEmail.delete(email); },
    locked() { const now = Date.now(); return [...byEmail].filter(([, v]) => v.until > now).map(([email, v]) => ({ email, until: new Date(v.until).toISOString() })); }
  };
}

/** One line in the security log (newest first, last 300 kept). */
export function securityEvent(d, event, { email = '', ip = '', ok = true, detail = '' } = {}) {
  (d.securityLog ||= []).unshift({ at: new Date().toISOString(), event, email, ip, ok, detail });
  if (d.securityLog.length > 300) d.securityLog.length = 300;
}
// X-Forwarded-For is only trusted behind a proxy you run (ATLAS_TRUST_PROXY=1); otherwise anyone could fake it.
export const clientIp = (req) => (process.env.ATLAS_TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket?.remoteAddress || '';
