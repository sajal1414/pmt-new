// Course payments. Razorpay for real online payment (test-mode keys work without moving money) and
// "COD (testing)" so purchases can be tried without a gateway. Configure in server/.env (see .env.example).
import crypto from 'node:crypto';

const cfg = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  secret: process.env.RAZORPAY_KEY_SECRET || '',
  currency: (process.env.PAYMENT_CURRENCY || 'USD').toUpperCase(),
  cod: process.env.PAYMENT_COD !== 'false',
  api: (process.env.RAZORPAY_API || 'https://api.razorpay.com/v1').replace(/\/$/, '')
});

/** What the checkout may offer (never exposes the secret). */
export function paymentConfig() {
  const c = cfg();
  return { razorpay: !!(c.keyId && c.secret), keyId: c.keyId, currency: c.currency, cod: c.cod };
}

/** Create a Razorpay order for `amount` (in currency units; Razorpay wants the smallest unit, e.g. cents/paise). */
export async function createOrder(amount, receipt, notes = {}, currency = '') {
  const c = cfg();
  if (!c.keyId || !c.secret) throw new Error('Online payment isn’t set up yet.');
  let res, body;
  try {
    res = await fetch(`${c.api}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${c.keyId}:${c.secret}`).toString('base64') },
      body: JSON.stringify({ amount: Math.round(amount * 100), currency: currency || c.currency, receipt: String(receipt).slice(0, 40), notes })
    });
    body = await res.json().catch(() => ({}));
  } catch { throw new Error('Couldn’t reach the payment provider. Check the internet connection and try again.'); }
  if (!res.ok) throw new Error(body?.error?.description || `Payment provider error (${res.status}).`);
  return body; // { id: 'order_…', amount, currency, … }
}

/** Razorpay signs "order_id|payment_id" with the key secret; anything else is not a real payment. */
export function verifySignature(orderId, paymentId, signature) {
  const c = cfg();
  if (!c.secret || !orderId || !paymentId || !signature) return false;
  const want = Buffer.from(crypto.createHmac('sha256', c.secret).update(`${orderId}|${paymentId}`).digest('hex'));
  const got = Buffer.from(String(signature));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
