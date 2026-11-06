import { useEffect, useState } from 'react';
import { api } from '../api.js';

// public site details (name, support contacts, whether email can be sent), fetched once and shared;
// Site Settings fires "atlas:site" after a save so everyone picks up the change
let cache = null, pending = null;
const fetchSite = () => (pending ||= api.get('/api/site').then((s) => { cache = s; pending = null; return s; }, () => { pending = null; return cache || {}; }));
if (typeof window !== 'undefined') window.addEventListener('atlas:site', () => { cache = null; fetchSite().then(() => window.dispatchEvent(new Event('atlas:site-loaded'))); });

/** { siteName, supportEmail, mail, ... }: `mail` is true when emails can be sent (SMTP set up and switched on). */
export function useSite() {
  const [site, setSite] = useState(cache || {});
  useEffect(() => {
    let live = true;
    fetchSite().then((s) => live && setSite(s));
    const again = () => live && setSite(cache || {});
    window.addEventListener('atlas:site-loaded', again);
    return () => { live = false; window.removeEventListener('atlas:site-loaded', again); };
  }, []);
  return site;
}
