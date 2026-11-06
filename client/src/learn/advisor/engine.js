// The Hazdemy course advisor: understands a typed question and finds courses.
// Everything here is plain rules over the course list from /api/learn/advisor; no external AI service.

export const LEVELS = ['Foundational', 'Intermediate', 'Advanced'];
export const AREAS = ['Data', 'AI', 'Sustainability', 'Security', 'Automation', 'Infrastructure'];
export const ROLES = [['dev', 'Developer / engineer'], ['admin', 'Administrator / operations'], ['business', 'Business user / analyst'], ['any', 'Not sure']];
export const EXPERIENCE = [['Foundational', 'New to it'], ['Intermediate', 'Some experience'], ['Advanced', 'Very experienced']];

const AREA_WORDS = {
  Data: ['data', 'etl', 'datastage', 'analytics', 'warehouse', 'db2', 'sql', 'cognos', 'planning', 'infosphere', 'catalog', 'governance'],
  AI: ['ai', 'genai', 'generative', 'watsonx', 'llm', 'machine learning', 'ml', 'chatbot', 'assistant'],
  Sustainability: ['sustainability', 'esg', 'maximo', 'envizi', 'carbon', 'energy', 'asset', 'tririga'],
  Security: ['security', 'qradar', 'guardium', 'cyber', 'identity', 'siem', 'verify', 'soar'],
  Automation: ['automation', 'rpa', 'bpm', 'workflow', 'webmethods', 'websphere', 'integration', 'mq', 'process', 'odm', 'decision'],
  Infrastructure: ['infrastructure', 'cloud', 'server', 'network', 'linux', 'storage', 'kubernetes', 'openshift', 'power', 'z', 'mainframe', 'zos']
};
const ROLE_RE = {
  dev: /\b(develop\w*|engineer\w*|programm\w*|architect\w*|coder|integrat\w*)\b/,
  admin: /\b(admin\w*|operat\w*|ops|install\w*|configur\w*|deploy\w*|maintain\w*|support)\b/,
  business: /\b(business|analyst\w*|end user\w*|users?|manager\w*|report\w*|planner\w*)\b/
};
const STOP = new Set('a an and the for of to in on with i im i\'m me my want wanna learn learning course courses training class classes about want need looking find show give some any is are be can you do does what which who how please under less than within up max maximum days day hours hour hrs short beginner beginners intermediate advanced expert new basic level levels foundational foundation intro introduction experienced'.split(' '));

const norm = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+#.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

export const areaOf = (c) => (c.area === 'IT Infrastructure' || c.area === 'Cloud' || c.area === 'Z' ? 'Infrastructure' : c.area);
export const daysOf = (c) => c.days || (c.hours ? Math.round((c.hours / 8) * 10) / 10 : 0);
export const lengthLabel = (c) => {
  const d = daysOf(c);
  if (!d) return 'Length not set';
  if (d < 1) return `${c.hours ? Math.round(c.hours * 10) / 10 : Math.round(d * 8)} hours`;
  return `${d} day${d === 1 ? '' : 's'}${c.hours ? ` (${c.hours} hours)` : ''}`;
};
export const levelRank = (l) => Math.max(0, LEVELS.indexOf(l));

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = a.length, n = b.length, row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) { const t = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return row[n];
}

/** Words the advisor knows: products, areas and the distinctive words in course names, with how each should be written. */
export function vocabulary(courses) {
  const v = new Map();
  v.fromCourses = new Set();
  const caps = (x) => (String(x).match(/[A-Z]/g) || []).length;
  const add = (w, show, real) => {
    const k = norm(w), label = show || w;
    if (k.length < 3 || STOP.has(k)) return;
    if (!v.has(k) || caps(label) > caps(v.get(k))) v.set(k, label);
    if (real) v.fromCourses.add(k);
  };
  for (const c of courses) {
    if (c.product) { add(c.product.replace(/\s+/g, ''), c.product, true); for (const w of c.product.split(/\s+/)) add(w, '', true); }
    for (const w of String(c.name).split(/[\s:(),/]+/)) if (w.length >= 4 && /[a-z]/i.test(w)) add(w, '', true);
  }
  for (const [a, ws] of Object.entries(AREA_WORDS)) { add(a); ws.forEach((w) => add(w)); }
  return v;
}

/** Fixes misspelt words ("datastge" → "datastage"); returns the corrected words and what was changed. */
export function correct(text, vocab) {
  const fixes = [];
  const out = words(text).map((w) => {
    if (w.length < 4 || STOP.has(w) || vocab.has(w) || /\d/.test(w)) return w;
    let best = null, bestD = 9;
    for (const k of vocab.keys()) { const dd = lev(w, k); if (dd < bestD) { best = k; bestD = dd; } }
    if (best && bestD <= (w.length <= 5 ? 1 : 2)) { fixes.push([w, vocab.get(best)]); return best; }
    return w;
  });
  return { words: out, fixes };
}

/** Closest known words to what was typed, for "Did you mean…?". */
export function suggestions(text, vocab, n = 3) {
  const ws = words(text).filter((w) => w.length >= 4 && !STOP.has(w));
  const scored = [];
  for (const w of ws) for (const k of vocab.fromCourses || vocab.keys()) { const dd = lev(w, k); if (dd > 0 && dd <= Math.max(1, Math.floor(w.length / 3))) scored.push([dd, vocab.get(k)]); }
  return [...new Set(scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]))].slice(0, n);
}

/** Pulls the product, level, area, role and duration out of a question. */
export function parse(text, courses, vocab) {
  const { words: ws, fixes } = correct(text, vocab);
  const t = ` ${ws.join(' ')} `;
  const q = { codes: [], level: '', area: '', areaHint: '', role: '', maxDays: 0, products: [], keywords: [], fixes };
  q.codes = [...String(text).matchAll(/\bhaz-[a-z]{2}-[a-z0-9]+\b/gi)].map((m) => m[0].toUpperCase());
  if (/\b(beginners?|basics?|new to|intro\w*|foundation\w*|fundamentals?|starter|novice)\b/.test(t)) q.level = 'Foundational';
  else if (/\bintermediate\b|\bsome experience\b/.test(t)) q.level = 'Intermediate';
  else if (/\b(advanced|expert|experienced|deep dive|senior)\b/.test(t)) q.level = 'Advanced';
  for (const [a, ws2] of Object.entries(AREA_WORDS)) if (new RegExp(`\\b${a.toLowerCase()}\\b`).test(t) || (a === 'Infrastructure' && /\bit infra/.test(t))) { q.area = a; break; }
  for (const [r, re] of Object.entries(ROLE_RE)) if (re.test(t)) { q.role = r; break; }
  q.areaHint = q.area || (Object.entries(AREA_WORDS).find(([, l]) => l.some((w) => new RegExp(`\\b${w}\\b`).test(t))) || [])[0] || '';
  const dur = t.match(/\b(?:under|less than|below|max(?:imum)?|up to|within|at most|no more than)\s+(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h)\b/) || t.match(/\b(\d+(?:\.\d+)?)\s*(days?|hours?|hrs?)\s+(?:or less|max|maximum|long)\b/);
  if (dur) q.maxDays = /^d/.test(dur[2]) ? +dur[1] : +dur[1] / 8;
  else if (/\b(short|quick|half day|one day|1 day)\b/.test(t)) q.maxDays = 1;
  const products = [...new Set(courses.map((c) => c.product).filter(Boolean))];
  q.products = [...new Map(products.filter((p) => { const k = norm(p); return k.length >= 2 && (t.includes(` ${k} `) || t.includes(` ${k.replace(/\s+/g, '')} `)); })
    .map((p) => [norm(p).replace(/\s+/g, ''), vocab.get(norm(p).replace(/\s+/g, '')) || p])).values()];
  const known = new Set([...q.products.flatMap((p) => words(p)), ...q.products.map((p) => norm(p).replace(/\s+/g, ''))]);
  q.keywords = ws.filter((w) => w.length >= 3 && !STOP.has(w) && !known.has(w) && !/^\d/.test(w) && !Object.values(AREA_WORDS).some((l) => l.includes(w) && AREAS.map((a) => a.toLowerCase()).includes(w)) && !(q.role && ROLE_RE[q.role].test(` ${w} `)));
  return q;
}

const roleScore = (c, role) => (!role || role === 'any' ? 0 : ROLE_RE[role].test(norm(`${c.audience} ${c.name}`)) ? 2 : 0);

/** Courses matching a parsed question, best first. `relaxed` says which filter had to be dropped. */
export function search(q, courses) {
  const score = (c) => {
    const name = norm(`${c.name} ${c.product} ${c.portfolio}`);
    let s = 0, hit = false;
    for (const p of q.products) if (norm(c.product) === norm(p) || name.includes(norm(p))) { s += 6; hit = true; }
    for (const k of q.keywords) if (name.includes(k)) { s += 2; hit = true; }
    if (q.area && areaOf(c) === q.area) { s += 2; hit = hit || (!q.products.length && !q.keywords.length); }
    if (!q.products.length && !q.keywords.length && !q.area) hit = true;
    s += roleScore(c, q.role) + (c.published ? 1 : 0) + (c.rating || 0) * 0.2 + Math.log((c.learners || 0) + 1) * 0.2;
    return { c, s, hit };
  };
  const base = courses.map(score).filter((x) => x.hit && (!q.area || areaOf(x.c) === q.area || q.products.length || q.keywords.length));
  const within = (x) => !q.maxDays || (daysOf(x.c) && daysOf(x.c) <= q.maxDays + 1e-9);
  let list = base.filter((x) => within(x) && (!q.level || x.c.level === q.level));
  let relaxed = '';
  if (!list.length && q.level) { list = base.filter(within); relaxed = list.length ? 'level' : ''; }
  if (!list.length && q.maxDays) { list = base; relaxed = list.length ? 'duration' : ''; }
  return { results: list.sort((a, b) => b.s - a.s).map((x) => x.c), relaxed };
}

/** A learning path for an area, role and starting level, ordered from Foundational upwards. */
export function learningPath(courses, { area, role, level }) {
  const start = levelRank(level);
  const pool = courses.filter((c) => (!area || area === 'Any' || areaOf(c) === area) && levelRank(c.level) >= start);
  const best = (l) => pool.filter((c) => c.level === l).sort((a, b) => roleScore(b, role) - roleScore(a, role) || (b.published - a.published) || (b.rating || 0) - (a.rating || 0)).slice(0, 3);
  return LEVELS.slice(start).flatMap(best);
}

export function similar(c, courses) {
  return courses.filter((x) => x.id !== c.id && (x.product && x.product === c.product || areaOf(x) === areaOf(c)))
    .sort((a, b) => (b.product === c.product) - (a.product === c.product) || Math.abs(levelRank(a.level) - levelRank(c.level)) - Math.abs(levelRank(b.level) - levelRank(c.level)) || (b.published - a.published))
    .slice(0, 6);
}

/** Finds a course by code or by a name typed in full. */
export function findCourse(text, courses) {
  const code = String(text).match(/\bhaz-[a-z]{2}-[a-z0-9]+\b/i);
  if (code) return courses.find((c) => c.code.toLowerCase() === code[0].toLowerCase()) || null;
  const t = norm(text);
  return courses.find((c) => t.length > 8 && norm(c.name) === t) || null;
}

/** What a typed message is asking for. */
export function intent(text, focus) {
  const t = ` ${norm(text)} `;
  if (/\b(start over|restart|reset|clear chat|new search)\b/.test(t)) return 'restart';
  if (/\b(go to|open|take me to|show me the)\b.*\b(training|courses|catalog|catalogue|explore)\b/.test(t)) return 'nav:explore';
  if (/\b(go to|open|take me to)\b.*\b(contact|enquiry|inquiry|form)\b/.test(t) || /^ (open )?contact( us| page| form)? $/.test(t)) return 'nav:contact';
  if (/\b(go to|open|take me to)\b.*\b(my learning)\b/.test(t)) return 'nav:my-learning';
  if (/\b(go to|open|take me to)\b.*\b(certificates?)\b/.test(t)) return 'nav:certificates';
  if (/\b(go to|open|take me to)\b.*\b(dashboard|home)\b/.test(t)) return 'nav:home';
  if (/\b(go to|open|take me to)\b.*\b(wishlist)\b/.test(t)) return 'nav:wishlist';
  if (/\bcompare\b/.test(t)) return 'compare';
  if (/\b(help me choose|help me pick|what should i (take|learn)|recommend)\b/.test(t)) return 'choose';
  if (/\bshow more\b|\bmore results\b/.test(t)) return 'more';
  if (/\bshortest\b/.test(t)) return 'shortest';
  if (/\b(highest|top|best)[ -]?(rated|rating|ratings|reviewed)\b|\b(best|top) courses\b/.test(t)) return 'rated';
  if (/\b(most )?popular\b|\bmost enrolled\b|\btrending\b/.test(t)) return 'popular';
  if (/^ (yes|yes please|sure|ok|okay|get details|yes get details|send details|ask for details) $/.test(t)) return 'details';
  if (focus) {
    if (/\b(prereq\w*|pre req\w*|requirements?|before (taking|i start|starting)|need to know|background)\b/.test(t)) return 'q:prereqs';
    if (/\b(who (is it|should|is this)|audience|attend|suitable|for whom|meant for)\b/.test(t)) return 'q:audience';
    if (/\b(how long|duration|length|how many (days|hours))\b/.test(t)) return 'q:length';
    if (/\b(what level|which level|difficulty|how hard|level)\b/.test(t)) return 'q:level';
    if (/\b(similar|related|alternatives?|like this|next course)\b/.test(t)) return 'q:similar';
  }
  if (/\b(price|pricing|cost|how much|quote|fee|fees)\b/.test(t)) return 'faq:pricing';
  if (/\b(delivery|online|onsite|on site|in person|virtual|private|classroom|remote)\b/.test(t)) return 'faq:delivery';
  if (/\b(certificat\w*|certified|badge|exam)\b/.test(t)) return 'faq:certificate';
  if (/\b(tailor\w*|custom\w*|team training|for my team|corporate|group)\b/.test(t)) return 'faq:tailored';
  if (/\b(mentor\w*|coach\w*)\b/.test(t)) return 'faq:mentorship';
  if (/\b(labs?|hands on|hands-on|sandbox|practice environment)\b/.test(t)) return 'faq:labs';
  if (/\b(contact|phone|email|call|talk to (someone|a human|sales)|reach you)\b/.test(t)) return 'faq:contact';
  if (/\b(coming soon|upcoming|new courses|in development|future courses)\b/.test(t)) return 'faq:soon';
  if (/^ (levels?|what are the levels|difficulty levels) $/.test(t) || /\bwhat levels\b/.test(t)) return 'faq:levels';
  if (/\b(areas|categories|topics|subjects)\b/.test(t) && !/\b(in|for)\b/.test(t)) return 'faq:areas';
  if (/^ (hi|hello|hey|hai|good (morning|afternoon|evening)) $/.test(t)) return 'hello';
  if (/^ (thanks?|thank you|thx|cheers) $/.test(t)) return 'thanks';
  return 'search';
}
