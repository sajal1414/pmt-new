// Site settings an admin changes on the Site Settings page. Stored with the data; anything not set falls back to these.
import { paymentConfig } from './payments.js';

export const DEFAULT_SETTINGS = {
  siteName: 'Hazdemy', supportEmail: '', supportPhone: '',
  currency: '', // empty: use PAYMENT_CURRENCY from server/.env
  cod: true, learnerSignup: true, instructorSignup: true,
  sessionHours: 12, allowRemember: true, lockAfter: 5, lockMinutes: 15,
  learnerStatuses: ['Available', 'Published'], // course statuses learners can see in Explore and enroll in
  emailOn: false // nothing is emailed to anyone until an admin turns this on (the test email still works)
};
export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'];

export const settingsOf = (d) => ({ ...DEFAULT_SETTINGS, ...(d.settings || {}) });
/** Whether learners can see (and enroll in) course `c`: its status is one the admin ticked in Site Settings. */
export const learnerSees = (d, c) => settingsOf(d).learnerStatuses.includes(c?.status);

/** Payment options after site settings: settings can switch COD off or pick the currency; keys stay in .env. */
export function payConfig(d) {
  const c = paymentConfig(), s = settingsOf(d);
  return { ...c, currency: s.currency || c.currency, cod: c.cod && s.cod !== false };
}

/** Announcements an admin sent to everyone, learners or instructors (newest first). */
export const announcementsFor = (d, who) => (d.announcements || []).filter((a) => a.audience === 'all' || a.audience === who)
  .map((a) => ({ kind: 'announcement', at: new Date(a.at).getTime(), text: `📣 ${a.title}${a.text ? ': ' + a.text : ''}`, link: who === 'learners' ? '/learn' : '/teach' }));
