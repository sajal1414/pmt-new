// Course payments. Stripe Checkout for real online payment (test keys, sk_test_…, move no money) and
// nothing else: there is no cash on delivery. Configure in server/.env (see .env.example).
//
// The learner pays on Stripe's own hosted page, so card details never reach this server. A payment counts only
// once Stripe itself says the Checkout Session is paid: either the server asks Stripe when the learner comes back
// (checkout/verify), or Stripe tells the server through the signed webhook (works even if the tab was closed).
import crypto from 'node:crypto';

const cfg = () => ({
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  currency: (process.env.PAYMENT_CURRENCY || 'USD').toUpperCase(),
  api: (process.env.STRIPE_API || 'https://api.stripe.com/v1').replace(/\/$/, '')
});

/** What the checkout may offer (never exposes the secret key). */
export function paymentConfig() {
  const c = cfg();
  return { stripe: !!c.secretKey, testMode: c.secretKey.startsWith('sk_test_') || c.secretKey.startsWith('rk_test_'), webhook: !!c.webhookSecret, currency: c.currency };
}

// Stripe wants amounts in the smallest unit (cents), except for these currencies, which have no minor unit.
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
export const toMinor = (amount, currency) => Math.round(+amount * (ZERO_DECIMAL.has(String(currency).toUpperCase()) ? 1 : 100));

/** Stripe's API takes form-encoded bodies with bracketed keys: { a: { b: 1 } } → a[b]=1. */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); // arrays become a[0][b]=…, which Stripe expects
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, pathname, body) {
  const c = cfg();
  if (!c.secretKey) throw new Error('Online payment isn’t set up yet.');
  let res, json;
  try {
    res = await fetch(`${c.api}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${c.secretKey}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? form(body).toString() : undefined
    });
    json = await res.json().catch(() => ({}));
  } catch { throw new Error('Couldn’t reach the payment provider. Check the internet connection and try again.'); }
  if (!res.ok) throw new Error(json?.error?.message || `Payment provider error (${res.status}).`);
  return json;
}

/**
 * A Stripe Checkout Session for one course. `successUrl` should contain {CHECKOUT_SESSION_ID}, which Stripe fills in.
 * Returns { id: 'cs_…', url: 'https://checkout.stripe.com/…' }; send the learner's browser to `url`.
 */
export async function createCheckout({ amount, currency, title, description, email, successUrl, cancelUrl, metadata = {} }) {
  const cur = String(currency || cfg().currency).toLowerCase();
  return stripe('POST', '/checkout/sessions', {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email || undefined,
    client_reference_id: metadata.paymentId,
    metadata,
    payment_intent_data: { metadata, description: title },
    line_items: [{ quantity: 1, price_data: { currency: cur, unit_amount: toMinor(amount, cur), product_data: { name: String(title).slice(0, 250), description: description ? String(description).slice(0, 500) : undefined } } }]
  });
}

/** The Checkout Session as Stripe has it now (payment_status 'paid' means the money is in). */
export const getCheckout = (id) => {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(id || ''))) throw new Error('That isn’t a valid payment reference.');
  return stripe('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
};

/**
 * Checks the Stripe-Signature header on a webhook call: "t=<time>,v1=<hmac>", the HMAC being SHA-256 of
 * "<time>.<raw body>" with the endpoint's signing secret (whsec_…). Rejects calls older than 5 minutes (replays).
 * Returns the parsed event, or null when the call didn't come from Stripe.
 */
export function verifyWebhook(rawBody, header) {
  const c = cfg();
  if (!c.webhookSecret || !rawBody || !header) return null;
  const parts = String(header).split(','), t = parts.find((p) => p.startsWith('t='))?.slice(2);
  const sigs = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - +t) > 300) return null;
  const want = Buffer.from(crypto.createHmac('sha256', c.webhookSecret).update(`${t}.${rawBody}`).digest('hex'));
  const ok = sigs.some((s) => { const got = Buffer.from(s); return got.length === want.length && crypto.timingSafeEqual(got, want); });
  if (!ok) return null;
  try { return JSON.parse(String(rawBody)); } catch { return null; }
}
