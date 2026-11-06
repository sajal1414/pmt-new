// Course outline documents (.docx / .doc) -> structured course fields.
// Outlines come in many shapes, so this looks for familiar section names ("Objectives", "Audience",
// "Course outline", ...) whether they are Word headings, bold lines or "Label: value" lines.
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { SKILLS } from './constants.js';
import { sanitizeHtml, escapeHtml } from './richtext.js';

const SECTIONS = [
  ['name', /^(course )?(title|name)$/],
  ['code', /^course (code|number|id)$|^code$/],
  ['duration', /^(course )?(duration|length)$|^(number of )?days$/],
  ['hours', /^(total |number of )?hours$/],
  ['skill', /^(skill|difficulty|experience|course) level$|^level$/],
  ['delivery', /^(delivery|modality|format|delivery (method|format|type))$/],
  ['description', /^(course )?(description|overview|summary|abstract|introduction)$|^about (this|the) course$/],
  ['objectives', /^(course |learning |training |performance )?(objectives?|outcomes?|goals?)$|^what you('|’)?ll learn$|^what you will learn$|^(skills|what) (you will )?gain(ed)?$|^(after|upon) (completing|completion of) this course/],
  ['persona', /^(target |intended )?audience$|^who should (attend|take this course)|^who (this course|it) is for$|^personas?$|^target learners?$/],
  ['prereqs', /^pre-?requisites?$|^(required |recommended )?(prior )?(knowledge|experience|skills)( required)?$|^before you (begin|start)$|^requirements$/],
  ['topics', /^(course |detailed )?(outline|agenda|topics?|contents?|modules?|syllabus|curriculum|units?|lessons?|schedule)( covered)?$|^course content$|^what('|’)?s covered$/],
  ['labs', /^(hands-on )?(labs?|exercises|lab exercises|practicals?)$/]
];
const MODULE = /^(module|unit|lesson|chapter|day|topic|section|part|week)\s*[\dIVX]+\b/i;
const NUMBERED = /^\d{1,2}(\.\d{1,2})*[.)]?\s+\S/;

const clean = (t) => t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const norm = (t) => clean(t).toLowerCase().replace(/^[\d.)\s]+/, '').replace(/^(section|part)\s+\d+\s*[:.-]\s*/, '').replace(/[:：\s]+$/, '');
const sectionOf = (t) => { const n = norm(t); if (n.length > 60) return null; const hit = SECTIONS.find(([, re]) => re.test(n)); return hit ? hit[0] : null; };
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const INLINE = { strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u' };

/**
 * Mammoth HTML -> flat blocks: { type: 'h' | 'p' | 'li', level, list, text, html, bold }.
 * `html` keeps inline bold / italic / underline so formatting survives; two-cell table rows become "Label: value".
 */
function blocksFromHtml(html) {
  const blocks = [], lists = [];
  let cur = null, row = null;
  const flush = () => {
    if (!cur) return;
    const text = clean(decode(cur.text));
    if (text) {
      const inner = cur.html.replace(/<(strong|em|u)>\s*<\/\1>/g, '').trim();
      if (row && cur.type === 'p') row.push(text); else blocks.push({ ...cur, text, html: inner });
    }
    cur = null;
  };
  const start = (type, extra = {}) => { cur = { type, level: 0, text: '', html: '', bold: false, ...extra }; };
  const re = /<(\/?)([a-z0-9]+)[^>]*>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) { if (!cur) start('p'); cur.text += m[3]; cur.html += m[3]; continue; }
    const close = m[1] === '/', tag = m[2].toLowerCase();
    if (tag === 'ul' || tag === 'ol') { flush(); if (close) lists.pop(); else lists.push(tag); }
    else if (/^h[1-6]$/.test(tag)) { flush(); if (!close) start('h', { level: +tag[1], bold: true }); }
    else if (tag === 'li') { flush(); if (!close) start('li', { level: lists.length, list: lists[lists.length - 1] }); }
    else if (tag === 'p') { if (cur?.type === 'li') continue; flush(); if (!close) start('p'); }
    else if (tag === 'tr') {
      flush();
      if (!close) row = [];
      else if (row) {
        const cells = row; row = null;
        const add = (text) => blocks.push({ type: 'p', level: 0, text, html: escapeHtml(text), bold: false });
        if (cells.length === 2) add(`${cells[0].replace(/[:：]\s*$/, '')}: ${cells[1]}`); else cells.forEach(add);
      }
    }
    else if (tag === 'td' || tag === 'th') { if (close && cur?.type !== 'li') flush(); }
    else if (tag === 'br') { if (cur) { cur.text += ' '; cur.html += '<br>'; } }
    else if (INLINE[tag]) {
      if (!cur) start('p');
      if (!close && INLINE[tag] === 'strong' && cur.type === 'p' && !clean(cur.text)) cur.bold = true; // starts bold: likely a heading
      cur.html += close ? `</${INLINE[tag]}>` : `<${INLINE[tag]}>`;
    }
  }
  flush();
  return blocks;
}

/** Blocks -> clean HTML that keeps headings, bold lines and nested bullet / numbered lists. */
function blocksToHtml(blocks) {
  let out = '';
  const open = []; // open lists, innermost last: { tag, level }
  const closeDeeperThan = (lvl) => { while (open.length && open[open.length - 1].level > lvl) out += `</li></${open.pop().tag}>`; };
  for (const b of blocks) {
    const inner = b.html || escapeHtml(b.text);
    if (b.type === 'li') {
      const lvl = Math.max(1, b.level);
      closeDeeperThan(lvl);
      if (open.length && open[open.length - 1].level === lvl) out += '</li>';
      else { const tag = b.list === 'ol' ? 'ol' : 'ul'; out += `<${tag}>`; open.push({ tag, level: lvl }); }
      out += `<li>${inner}`;
    } else {
      closeDeeperThan(0);
      out += b.type === 'h' ? `<h4>${inner}</h4>` : `<p>${b.bold && !/^<strong>/.test(inner) ? `<strong>${inner}</strong>` : inner}</p>`;
    }
  }
  closeDeeperThan(0);
  return sanitizeHtml(out);
}

/** Plain text (legacy .doc) -> blocks, using bullet characters and indentation for lists */
function blocksFromText(text) {
  return text.split(/\r?\n/).map((raw) => {
    const t = clean(raw);
    if (!t) return null;
    const indent = raw.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
    const bullet = t.match(/^([•●▪■◦○\-–*·o])\s+(.*)$/);
    if (bullet) return { type: 'li', level: indent >= 4 || /[◦○o]/.test(bullet[1]) ? 2 : 1, text: bullet[2] };
    return { type: 'p', level: 0, text: t, bold: t.length < 60 && !/[.;]$/.test(t) };
  }).filter(Boolean);
}

export async function readDocument(buffer, filename) {
  if (/\.docx$/i.test(filename)) {
    const { value } = await mammoth.convertToHtml({ buffer }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => p:fresh"] });
    return blocksFromHtml(value);
  }
  if (/\.doc$/i.test(filename)) {
    const doc = await new WordExtractor().extract(buffer);
    return blocksFromText(doc.getBody());
  }
  throw new Error('Use a Word document (.docx or .doc).');
}

const minsOf = (t) => {
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/i), m = t.match(/(\d+)\s*(?:m|min|mins|minutes?)\b/i);
  return h || m ? Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)) : '';
};
const stripTime = (t) => clean(t.replace(/[([]\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)(?:\s*\d+\s*(?:m|min|mins|minutes?))?\s*[)\]]/gi, '').replace(/\s[-–—]\s*\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|min|mins|minutes?)\s*$/i, ''));

/** Blocks -> { name, code, description, objectives[], persona, prereqs, duration, hours, skill, delivery, topics[{title, mins, points[]}], topicsHtml, objectivesHtml } */
export function parseOutline(blocks) {
  const out = { name: '', code: '', description: '', objectives: [], persona: [], prereqs: [], duration: '', hours: '', skill: '', delivery: '', topics: [], labs: [] };
  const text = { description: [] };
  const rich = { topics: [], objectives: [] }; // original blocks, to rebuild formatted HTML
  let section = null, topic = null, topHeading = 99, listBase = null;

  const startTopic = (title) => { topic = { title: stripTime(title).replace(/^[-–•\s]+/, ''), mins: minsOf(title), points: [] }; out.topics.push(topic); };
  const setValue = (key, value) => {
    const v = clean(value);
    if (!v) return;
    if (key === 'name' && !out.name) out.name = v;
    else if (key === 'code' && !out.code) out.code = v.split(/[\s,;]/)[0];
    else if (key === 'duration') { const d = v.match(/(\d+(?:\.\d+)?)\s*days?/i), h = v.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i); if (d) out.duration = +d[1]; if (h) out.hours = +h[1]; if (!d && !h && /^\d+(\.\d+)?$/.test(v)) out.duration = +v; }
    else if (key === 'hours') { const h = v.match(/\d+(\.\d+)?/); if (h) out.hours = +h[0]; }
    else if (key === 'skill') out.skill = SKILLS.find((s) => new RegExp(s.slice(0, 5), 'i').test(v)) || (/basic|beginner|intro/i.test(v) ? 'Foundational' : /expert/i.test(v) ? 'Advanced' : out.skill);
    else if (key === 'delivery') out.delivery = v;
    else return false;
    return true;
  };

  for (const b of blocks) {
    const looksHeading = b.type === 'h' || (b.type === 'p' && b.bold);
    // "Label: value" on one line
    const lv = b.type !== 'li' && b.text.match(/^([^:：]{2,40})[:：]\s*(.+)$/);
    const lvKey = lv && sectionOf(lv[1]);
    if (lvKey && ['name', 'code', 'duration', 'hours', 'skill', 'delivery'].includes(lvKey)) { setValue(lvKey, lv[2]); continue; }
    const key = looksHeading || b.type === 'p' ? sectionOf(b.text) : null;
    if (key) {
      section = key; topic = null;
      if (b.type === 'h') topHeading = b.level;
      listBase = null;
      continue;
    }
    if (lvKey) { section = lvKey; topic = null; b.text = lv[2]; }

    // modules can appear anywhere, with or without an "Outline" heading
    if (b.type !== 'li' && (MODULE.test(b.text) || (section === 'topics' && (b.type === 'h' || (b.bold && NUMBERED.test(b.text)))))) { section = 'topics'; startTopic(b.text); rich.topics.push(b); continue; }

    if (!section) {
      if (!out.name && (b.type === 'h' || b.bold) && b.text.length <= 140) out.name = b.text;
      else if (b.type === 'p' && b.text.length > 60) text.description.push(b.text);
      continue;
    }
    if (['name', 'code', 'duration', 'hours', 'skill', 'delivery'].includes(section)) { setValue(section, b.text); section = null; continue; }
    if (section === 'description') text.description.push(b.type === 'li' ? '• ' + b.text : b.text);
    else if (section === 'objectives') rich.objectives.push(b) && out.objectives.push(b.text.replace(/^(students|participants|learners|you) will( be able to)?:?\s*/i, ''));
    else if (section === 'persona') out.persona.push(b.text);
    else if (section === 'prereqs') out.prereqs.push(b.text);
    else if (section === 'labs') out.labs.push(b.text);
    else if (section === 'topics') {
      rich.topics.push(b);
      if (b.type === 'li') {
        // bullets under a module heading are its points; in a plain list the outer bullets are topics
        if (topic && !topic.fromList) topic.points.push(b.text);
        else if (listBase == null || b.level <= listBase) { listBase ??= b.level; startTopic(b.text); topic.fromList = true; }
        else topic.points.push(b.text);
      } else if (b.type === 'h' && b.level > topHeading) startTopic(b.text);
      else if (topic) topic.points.push(b.text);
      else { startTopic(b.text); topic.fromList = true; }
    }
  }
  // objectives often arrive as one intro line + bullets: drop a trailing-colon lead-in
  out.objectives = out.objectives.filter((o, i) => !(i === 0 && /:$/.test(o) && out.objectives.length > 1));
  out.description = text.description.join('\n').trim();
  return {
    ...out,
    persona: out.persona.join('\n'), prereqs: out.prereqs.join('\n'),
    topicsHtml: rich.topics.length ? blocksToHtml(rich.topics) : '',
    objectivesHtml: rich.objectives.length ? blocksToHtml(rich.objectives) : '',
    topics: out.topics.map(({ fromList, ...t }) => t).filter((t) => t.title)
  };
}

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['ibm', 'the', 'and', 'for', 'with', 'course'].includes(w)));
const similarity = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / Math.max(A.size, B.size); };

/** Find the course a document belongs to: by course code (in the file name or text), then by title. */
export function matchCourse(parsed, filename, courses, fullText) {
  const hay = `${filename} ${parsed.code} ${fullText}`.toLowerCase();
  const byCode = courses.find((c) => c.code && new RegExp(`(^|[^a-z0-9])${c.code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay));
  if (byCode) return { courseId: byCode.id, by: 'code' };
  const byIbm = courses.find((c) => c.ibmCode && String(c.ibmCode).split(/[,;\s]+/).some((k) => k.length > 3 && hay.includes(k.toLowerCase())));
  if (byIbm) return { courseId: byIbm.id, by: 'IBM code' };
  const title = parsed.name || filename.replace(/\.[^.]+$/, '');
  let best = null, score = 0;
  for (const c of courses) { const s = similarity(title, c.name); if (s > score) { score = s; best = c; } }
  return score >= 0.6 ? { courseId: best.id, by: 'title' } : { courseId: '', by: '' };
}

const fmtLen = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
/** Topics as editable text: "1. Title (45 min)" with its points indented underneath. */
export const topicsText = (topics) => topics.map((t, i) => [`${i + 1}. ${t.title}${t.mins ? ` (${fmtLen(t.mins)})` : ''}`, ...t.points.map((p) => '   • ' + p)].join('\n')).join('\n');

const DAY = /^day\s*\d+\b/i;
/**
 * Topics -> lessons. Every unit / module is a lesson. When the outline is split into days, each lesson
 * also records its day ("Day 1: …") so the course page can group lessons by day.
 */
export function lessonsFromTopics(topics, uid) {
  const lesson = (t, day = '', lead = []) => ({ id: uid('l'), day, title: t.title, mins: t.mins, video: '', attachment: '', article: [...lead, ...t.points].map((p) => '• ' + p).join('\n') });
  const out = [];
  let day = null, dayPoints = [];
  for (const t of topics) {
    if (DAY.test(t.title)) {
      if (day && dayPoints.length) out.push(lesson(day, day.title)); // a day with notes but no units is a lesson itself
      day = t; dayPoints = t.points.slice();
      continue;
    }
    out.push(lesson(t, day ? day.title : '', dayPoints)); // day-level notes go on the day's first unit
    dayPoints = [];
  }
  if (day && dayPoints.length) out.push(lesson(day, day.title));
  return out;
}

/** Course fields to save from a parsed outline. Content fields (incl. topics) come from the document; catalog fields only fill blanks. */
export function outlineToCourse(parsed, existing, uid) {
  const lessons = lessonsFromTopics(parsed.topics, uid);
  const patch = {};
  if (parsed.description) patch.description = parsed.description;
  // keep the document's formatting (bold, headings, nested lists) when there is any; plain text otherwise
  if (parsed.objectives.length) patch.objectives = parsed.objectivesHtml || parsed.objectives.map((o) => '• ' + o).join('\n');
  if (parsed.topics.length) patch.topics = parsed.topicsHtml || topicsText(parsed.topics);
  if (parsed.persona) patch.persona = parsed.persona;
  if (parsed.prereqs) patch.prereqs = parsed.prereqs;
  if (parsed.labs.length && !existing?.labConfig) patch.labConfig = parsed.labs.join('; ');
  for (const k of ['name', 'code', 'duration', 'hours', 'skill', 'delivery']) if (parsed[k] !== '' && (existing?.[k] === '' || existing?.[k] == null)) patch[k] = parsed[k];
  return { patch, lessons };
}
