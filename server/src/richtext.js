// Rich text for course topics and objectives: a small allow-list of tags, no attributes.
// Anything else (styles, classes, scripts, Word markup) is dropped; the text inside is kept.
const ALLOWED = { p: 'p', div: 'p', br: 'br', strong: 'strong', b: 'strong', em: 'em', i: 'em', u: 'u', h1: 'h4', h2: 'h4', h3: 'h4', h4: 'h4', h5: 'h4', h6: 'h4', ul: 'ul', ol: 'ol', li: 'li' };

export const isHtml = (s) => /<(p|h[1-6]|ul|ol|li|strong|em|u|br|div)\b/i.test(String(s || ''));
export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    .replace(/<(p|h4|li)>\s*(<br>)?\s*<\/\1>/g, '') // empty blocks
    .trim();
}

export const htmlToText = (html) => String(html || '')
  .replace(/<li>/gi, '\n• ').replace(/<\/(p|h4|div)>|<br>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\n{2,}/g, '\n').trim();
