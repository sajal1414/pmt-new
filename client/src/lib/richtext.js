// Rich text helpers for course topics and objectives. Mirrors server/src/richtext.js:
// a small allow-list of tags with no attributes, so stored HTML is always safe to render.
const ALLOWED = { p: 'p', div: 'p', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', h1: 'h4', h2: 'h4', h3: 'h4', h4: 'h4', h5: 'h4', h6: 'h4', ul: 'ul', ol: 'ol', li: 'li' };

export const isHtml = (s) => /<(p|h[1-6]|ul|ol|li|strong|em|u|br|div)\b/i.test(String(s || ''));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title|xml|o:p)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z][a-z0-9:]*)\b[^>]*>/gi, (tag, name) => {
      const t = ALLOWED[name.toLowerCase()];
      if (!t) return '';
      if (t === 'br') return '<br>';
      return tag[1] === '/' ? `</${t}>` : `<${t}>`;
    })
    .replace(/<(p|h4|li)>\s*(<br>)?\s*<\/\1>/g, '')
    .trim();
}

/** Older plain-text values ("1. Topic" lines with indented "• point" lines) -> HTML lists. */
export function plainToHtml(text) {
  let out = '';
  const open = [];
  const closeDeeperThan = (lvl) => { while (open.length && open[open.length - 1] > lvl) { out += '</li></ul>'; open.pop(); } };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) continue;
    const bullet = t.match(/^[•\-*▪◦]\s*(.*)$/);
    if (bullet) {
      const lvl = raw.match(/^\s*/)[0].length >= 2 ? 2 : 1;
      closeDeeperThan(lvl);
      if (open.length && open[open.length - 1] === lvl) out += '</li>'; else { out += '<ul>'; open.push(lvl); }
      out += `<li>${esc(bullet[1])}`;
    } else { closeDeeperThan(0); out += `<p>${esc(t)}</p>`; }
  }
  closeDeeperThan(0);
  return out;
}

export const toHtml = (v) => (isHtml(v) ? sanitizeHtml(v) : plainToHtml(v));

export const htmlToText = (html) => (isHtml(html) ? String(html)
  .replace(/<li>/gi, '\n• ').replace(/<\/(p|h4|div)>|<br>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\n{2,}/g, '\n').trim() : String(html ?? ''));
