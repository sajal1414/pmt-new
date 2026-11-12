export const GROUPS = [
  { id: 'available', label: 'Available & Ready', short: 'Available', statuses: ['Available', 'Published'], tone: 'ok', mark: 'var(--ok)', icon: 'doc' },
  { id: 'dev', label: 'In Development & Review', short: 'In development', statuses: ['In Development', 'Draft', 'In Progress', 'For Review', 'Updated Version', 'Custom', 'Lockheed'], tone: 'warn', mark: 'var(--warn)', icon: 'clock' },
  { id: 'pipeline', label: 'Pipeline & Backlog', short: 'Pipeline', statuses: ['Pipeline', 'Backlog'], tone: 'acc', mark: 'var(--accent)', icon: 'db' },
  { id: 'retired', label: 'Retired & Archived', short: 'Retired', statuses: ['Retired'], tone: 'gone', mark: 'var(--gone)', icon: 'archive' }
];
export const STATUSES = ['Available', 'In Development', 'Backlog', 'Pipeline', 'Draft', 'In Progress', 'For Review', 'Updated Version', 'Custom', 'Published', 'Lockheed', 'Retired'];
export const OUTLINE = ['Missing', 'Not Yet Scoped', 'Draft', 'Partially Complete', 'Validated'];
export const SKILLS = ['Foundational', 'Intermediate', 'Advanced'];
export const LABLOC = ['ITZ', 'Hazdemy', 'Instructor owned', 'N/A'];
export const IPOWN = ['Hazdemy', 'SubK'];
export const TRAVEL = ['Can Travel', 'Virtual Only', 'In Person Only', 'Both'];
export const ROLES = ['Admin', 'Instructor', 'Learner'];

export const groupOf = (s) => GROUPS.find((g) => g.statuses.includes(s)) || GROUPS[2];

const PLAT_ICON = { Security: 'shieldo', Cloud: 'cloud', 'Data & AI': 'db', Data: 'db', AI: 'chip', Automation: 'gear', Integration: 'link', Infrastructure: 'box', 'IT Infrastructure': 'box', Z: 'box', Mainframes: 'box', Sustainability: 'leaf' };
// course areas (Hazdemy palette): Data red, AI purple, Sustainability green, Security red, Automation orange, Infrastructure teal
const PLAT_TONE = { Security: 't-sec', Cloud: 't-infra', 'Data & AI': 't-data', Data: 't-data', AI: 't-ai', Automation: 't-auto', Integration: 't-auto', Infrastructure: 't-infra', 'IT Infrastructure': 't-infra', Z: 't-infra', Mainframes: 't-infra', Sustainability: 't-sus' };
export const AREA_COLOR = { 't-data': '#8E1B1E', 't-ai': '#7C3AED', 't-sus': '#14A36B', 't-sec': '#E5484D', 't-auto': '#FF7A45', 't-infra': '#0E8A8A' };
export const platformIcon = (p) => PLAT_ICON[p] || 'layers';
export const platformTone = (p) => PLAT_TONE[p] || 't-acc';

export const uniq = (a) => [...new Set(a.filter((x) => x != null && x !== ''))];
export const splitList = (s) => uniq(String(s ?? '').split(/[,;|\n]/).map((x) => x.trim()));
export const isURL = (s) => /^(https?:\/\/|\/api\/outlines\/file\/)/i.test(String(s || '').trim()); // stored outline docs count as links
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
export const fmtDur = (d) => (d === '' || d == null ? '—' : `${+d}d`);
export const fmtMins = (m) => { m = +m || 0; if (!m) return '—'; const h = Math.floor(m / 60), r = m % 60; return `${h ? h + ' h ' : ''}${r ? r + ' min' : ''}`.trim(); };
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'Just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`; return `${Math.floor(s / 86400)} d ago`; };
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Platforms a new course is created under, with the code series each one gets (HAZ-DA-0001…; see nextCode on the server). */
export const CODE_PLATFORMS = [['Data & AI', 'DA'], ['Sustainability', 'SU'], ['Security', 'SE'], ['Automation', 'AU'], ['IT Infrastructure', 'IT'], ['Other', 'OT']];
