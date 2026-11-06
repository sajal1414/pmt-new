// Email through an SMTP server (Microsoft 365, Gmail, SendGrid, ...). Everything comes from server/.env:
//   SMTP_HOST, SMTP_PORT (587 or 465), SMTP_SECURE (true for port 465), SMTP_USER, SMTP_PASS, MAIL_FROM
// Without SMTP_HOST nothing is sent and the app works as before.
import nodemailer from 'nodemailer';

export function mailConfig() {
  const host = String(process.env.SMTP_HOST || '').trim(), port = +process.env.SMTP_PORT || 587;
  const user = String(process.env.SMTP_USER || '').trim();
  return {
    configured: !!host, host, port, user,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    from: String(process.env.MAIL_FROM || user || '').trim()
  };
}

let cached = null, cachedKey = '';
function transport() {
  const c = mailConfig(), key = JSON.stringify(c);
  if (!cached || key !== cachedKey) {
    cached = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: c.user ? { user: c.user, pass: process.env.SMTP_PASS || '' } : undefined,
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    cachedKey = key;
  }
  return cached;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
/** Plain text as a simple branded HTML email (line breaks kept, links clickable). */
export function htmlOf(text, site = 'Hazdemy') {
  const body = escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#8E1B1E">${u}</a>`).replace(/\n/g, '<br>');
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2B0A0B;max-width:600px">
<div style="border-bottom:3px solid #8E1B1E;padding:0 0 10px;margin:0 0 18px;font-size:20px;font-weight:700;color:#8E1B1E">${escapeHtml(site)}</div>
${body}
<p style="margin:24px 0 0;font-size:12px;color:#8A7471">Sent by ${escapeHtml(site)} Learning Services</p></div>`;
}

/**
 * Sends one email. `to` / `bcc` are an address or a list. Throws a readable error when SMTP isn't set up or the
 * server refuses the message.
 */
export async function sendMail({ to, bcc, subject, text, replyTo, site }) {
  const c = mailConfig();
  if (!c.configured) throw new Error('Email isn’t set up yet: add the SMTP settings to server/.env and restart the server.');
  if (!c.from) throw new Error('Set MAIL_FROM (or SMTP_USER) in server/.env: the address emails are sent from.');
  try {
    return await transport().sendMail({ from: c.from, to, bcc, subject, text, html: htmlOf(text, site), replyTo });
  } catch (e) {
    const why = e.code === 'EAUTH' ? 'the SMTP user name or password was refused' : e.code === 'ECONNECTION' || e.code === 'ETIMEDOUT' || e.code === 'ESOCKET' ? `couldn’t reach ${c.host}:${c.port}` : e.response || e.message;
    throw new Error(`The email wasn’t sent: ${why}.`);
  }
}

/** Sends without waiting and never fails the request that triggered it (problems go to the server log). */
export const sendLater = (msg, log = console.error) => { if (mailConfig().configured) sendMail(msg).catch((e) => log(e.message)); };
