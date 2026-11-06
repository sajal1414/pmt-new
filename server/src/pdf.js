// Course -> downloadable PDF (A4): title band, details grid, description, objectives, audience,
// prerequisites, and the outline (days > lessons > points and exercise boxes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { isHtml } from './richtext.js';

// A system font with wide Unicode coverage when one exists; otherwise PDF's built-in Helvetica.
const FONT_SETS = [
  ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/segoeuii.ttf', 'C:/Windows/Fonts/segoeuiz.ttf'],
  ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/ariali.ttf', 'C:/Windows/Fonts/arialbi.ttf'],
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'],
  ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Italic.ttf', '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf']
];
const SYSTEM_FONTS = FONT_SETS.find((set) => set.every((f) => fs.existsSync(f)));

// Logos for the top of every course PDF: server/assets/logos/hazdemy.png (left) and ibm.png (right).
// Read on each download, so replacing a file takes effect without restarting. PNG or JPG; a missing file is skipped.
const LOGO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'logos');
const findLogo = (name) => ['png', 'jpg', 'jpeg'].map((ext) => path.join(LOGO_DIR, `${name}.${ext}`)).find((f) => fs.existsSync(f));
const logoFiles = () => ({ left: findLogo('hazdemy'), right: findLogo('ibm') });
const F = { r: 'R', b: 'B', i: 'I', bi: 'BI' };
// Built-in fonts only cover Latin-1 plus a few typographic marks; replace anything else
const WINANSI = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const safe = (t) => (SYSTEM_FONTS ? String(t) : String(t).replace(/[^\x00-\xff]/g, (ch) => (WINANSI.has(ch) ? ch : ch === '→' ? '->' : ch === '✓' ? 'v' : '?')));

const C = { ink: '#2B0A0B', ink2: '#5F4543', muted: '#8F7471', line: '#ECDCD8', accent: '#8E1B1E', accentInk: '#8E1B1E', accentSoft: '#F8E9E8', violet: '#4E0405', warn: '#FF7A45', warnInk: '#C2410C', warnSoft: '#FFF1EA', warnLine: '#FFD3BE' };
const DAY = /^(day\s*\d+)\s*[:\-–—]?\s*(.*)$/i;
const BULLET = /^\s*[•\-*]\s*/;
const EXERCISE = /^(exercise|lab|hands[- ]on(?: lab)?|activity|practical|workshop)\s*(\d+[a-z]?)?\s*[:.\-–—]\s*(.*)$/i;
const EX_DETAIL = /^(objective|goal|task|outcome|deliverable|scenario|steps?|duration)s?\s*[:\-–—]\s*(.*)$/i;
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const fmtMins = (m) => (!m ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

/** Lesson notes -> parts, same rules as the course page: plain lines are sub-headings, "Exercise N:" + "Objective:" form a box. */
function noteParts(text) {
  const parts = [];
  for (const raw of String(text || '').split('\n')) {
    if (!raw.trim()) continue;
    const t = raw.replace(BULLET, '').trim(), last = parts[parts.length - 1];
    const ex = t.match(EXERCISE), det = t.match(EX_DETAIL);
    if (ex) parts.push({ kind: 'exercise', label: `${ex[1][0].toUpperCase()}${ex[1].slice(1).toLowerCase()}${ex[2] ? ' ' + ex[2] : ''}`, title: ex[3], details: [] });
    else if (last?.kind === 'exercise' && (det || /^\s{2,}/.test(raw))) last.details.push(det ? { label: det[1][0].toUpperCase() + det[1].slice(1).toLowerCase(), text: det[2] } : { label: '', text: t });
    else if (!BULLET.test(raw)) parts.push({ kind: 'head', text: t });
    else parts.push({ kind: 'point', text: t, level: /^\s{2,}/.test(raw) ? 2 : 1 });
  }
  return parts;
}

/** Sanitized rich HTML (p, h4, ul/ol/li, strong/em/u, br) -> blocks of styled runs. Plain text -> bullets/paragraphs. */
function richBlocks(value) {
  if (!isHtml(value)) {
    return String(value || '').split('\n').filter((l) => l.trim()).map((l) => {
      const bullet = BULLET.test(l);
      return { type: bullet ? 'li' : 'p', level: bullet ? (/^\s{2,}/.test(l) ? 2 : 1) : 0, marker: '•', runs: [{ text: l.replace(BULLET, '').trim() }] };
    });
  }
  const blocks = [], lists = [], style = { b: 0, i: 0, u: 0 };
  let cur = null;
  const end = () => { if (cur && cur.runs.some((r) => r.text.trim())) blocks.push(cur); cur = null; };
  const re = /<(\/?)(p|h4|ul|ol|li|strong|em|u|br)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(value)))) {
    if (m[3] !== undefined) {
      const text = decode(m[3]).replace(/\s+/g, ' ');
      if (!text.trim() && !cur) continue;
      if (!cur) cur = { type: 'p', level: 0, runs: [] };
      cur.runs.push({ text, b: style.b > 0, i: style.i > 0, u: style.u > 0 });
      continue;
    }
    const close = m[1] === '/', tag = m[2];
    if (tag === 'strong') style.b += close ? -1 : 1;
    else if (tag === 'em') style.i += close ? -1 : 1;
    else if (tag === 'u') style.u += close ? -1 : 1;
    else if (tag === 'br') { if (cur) cur.runs.push({ text: '\n' }); }
    else if (tag === 'ul' || tag === 'ol') { end(); if (close) lists.pop(); else lists.push({ tag, n: 0 }); }
    else if (tag === 'li') { end(); if (!close) { const l = lists[lists.length - 1]; cur = { type: 'li', level: Math.max(1, lists.length), marker: l?.tag === 'ol' ? `${++l.n}.` : lists.length > 1 ? '◦' : '•', runs: [] }; } }
    else { end(); if (!close) cur = { type: tag === 'h4' ? 'h' : 'p', level: 0, runs: [] }; }
  }
  end();
  for (const b of blocks) { b.runs[0].text = b.runs[0].text.replace(/^\s+/, ''); const l = b.runs[b.runs.length - 1]; l.text = l.text.replace(/\s+$/, ''); }
  return blocks;
}

/** Shared pieces for other PDFs (catalog): fonts, colours, Unicode-safe text and the logo files. */
export const pdfKit = {
  F, C, safe, logoFiles,
  setupFonts(doc) {
    if (SYSTEM_FONTS) [F.r, F.b, F.i, F.bi].forEach((name, k) => doc.registerFont(name, SYSTEM_FONTS[k]));
    else Object.assign(F, { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique', bi: 'Helvetica-BoldOblique' });
  }
};

/** What a course PDF can show; the course name is always there. Leaving `fields` out shows everything. */
export const PDF_FIELDS = ['logos', 'code', 'ibmCode', 'vendor', 'platform', 'product', 'portfolio', 'delivery', 'duration', 'skill', 'status', 'instructors', 'maxStudents',
  'description', 'objectives', 'persona', 'prereqs', 'outline', 'lessonTimes', 'notes', 'exercises'];
export const pdfFields = (list) => (Array.isArray(list) ? list.filter((k) => PDF_FIELDS.includes(k)) : PDF_FIELDS);

export function coursePdf(course, out, { fields = PDF_FIELDS } = {}) {
  const has = (k) => fields.includes(k);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 64, left: 50, right: 50 }, bufferPages: true, info: { Title: `${course.code} – ${course.name}`, Author: 'Hazdemy', Subject: 'Course outline' } });
  if (SYSTEM_FONTS) [F.r, F.b, F.i, F.bi].forEach((name, k) => doc.registerFont(name, SYSTEM_FONTS[k]));
  else Object.assign(F, { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique', bi: 'Helvetica-BoldOblique' });
  doc.pipe(out);

  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const room = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const font = (r) => (r.b && r.i ? F.bi : r.b ? F.b : r.i ? F.i : F.r);
  const text = (t, o = {}) => doc.font(o.font || F.r).fontSize(o.size || 10).fillColor(o.color || C.ink2).text(safe(t), o.x ?? L, o.y ?? doc.y, { width: o.width ?? W, lineGap: o.lineGap ?? 2, ...o.opts });
  // styled runs in one paragraph, wrapping as one block
  const runs = (rs, x, width, size, color, base = {}) => {
    const list = rs.filter((r) => r.text);
    list.forEach((r, k) => {
      doc.font(font({ ...base, ...r, b: r.b || base.b })).fontSize(size).fillColor(r.color || color);
      const opts = { width, lineGap: 2, continued: k < list.length - 1, underline: !!r.u };
      if (k === 0) doc.text(safe(r.text), x, doc.y, opts); else doc.text(safe(r.text), opts);
    });
  };

  // --- logo strip (white, so any logo colours read well): Hazdemy left, IBM right ---
  const logos = has('logos') ? logoFiles() : {};
  const stripH = logos.left || logos.right ? 66 : 0, logoH = 42, logoW = 150;
  const logo = (file, x, align) => { try { doc.image(file, x, (stripH - logoH) / 2, { fit: [logoW, logoH], align, valign: 'center' }); } catch { /* unreadable image: leave the space empty */ } };
  if (logos.left) logo(logos.left, L, 'left');
  if (logos.right) logo(logos.right, L + W - logoW, 'right');

  // --- title band: grows to fit the full course name (a smaller size for very long names) ---
  const title = course.name || 'Untitled course', top = stripH;
  const titleH = (size) => doc.font(F.b).fontSize(size).heightOfString(safe(title), { width: W, lineGap: 1 });
  const titleSize = titleH(20) > 80 ? 16 : 20, metaY = top + 46 + Math.max(48, titleH(titleSize) + 10), bandH = metaY - top + 24;
  // light band with dark text, a brand-red rule underneath
  doc.rect(0, top, doc.page.width, bandH).fill('#F6EBE8');
  doc.rect(0, top + bandH - 3, doc.page.width, 3).fill(C.accent);
  text('HAZDEMY · LEARNING SERVICES', { y: top + 30, size: 8, font: F.b, color: C.accent, opts: { characterSpacing: 1.2 } });
  text(title, { y: top + 46, size: titleSize, font: F.b, color: C.ink, lineGap: 1 });
  text([has('code') && course.code, has('status') && course.status, has('platform') && course.platform].filter(Boolean).join('   ·   '), { y: metaY, size: 9.5, font: F.b, color: C.ink2 });
  doc.y = top + bandH + 22;

  // --- details grid ---
  const dur = [course.duration !== '' && course.duration != null && `${course.duration} day${+course.duration === 1 ? '' : 's'}`, course.hours && `${course.hours} hours`].filter(Boolean).join(' · ');
  const facts = [['Course code', course.code, 'code'], ['IBM course codes', course.ibmCode, 'ibmCode'], ['Vendor', course.vendor, 'vendor'], ['Platform', course.platform, 'platform'], ['Product', course.product, 'product'], ['Portfolio', course.portfolio, 'portfolio'],
    ['Modality', course.delivery, 'delivery'], ['Duration', dur, 'duration'], ['Skill level', course.skill, 'skill'], ['Status', course.status, 'status'], ['Instructors', (course.instructors || []).join(', '), 'instructors'], ['Max students', course.maxStudents, 'maxStudents']]
    .filter(([, v, k]) => has(k) && v !== '' && v != null && String(v).trim());
  const colW = (W - 16) / 2;
  for (let k = 0; k < facts.length; k += 2) {
    const row = facts.slice(k, k + 2), y = doc.y;
    const hs = row.map(([, v]) => doc.font(F.r).fontSize(10).heightOfString(safe(String(v)), { width: colW }) + 14);
    room(Math.max(...hs) + 6);
    const y0 = doc.y === y ? y : doc.y;
    row.forEach(([label, v], c) => {
      const x = L + c * (colW + 16);
      text(label.toUpperCase(), { x, y: y0, width: colW, size: 7.5, font: F.b, color: C.muted, opts: { characterSpacing: 0.6 } });
      text(String(v), { x, y: y0 + 11, width: colW, size: 10, color: C.ink });
    });
    doc.y = y0 + Math.max(...hs) + 6;
  }
  if (facts.length) { doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).lineWidth(0.75).strokeColor(C.line).stroke(); doc.y += 16; }

  // --- sections ---
  const section = (title) => {
    room(48);
    doc.y += 6;
    doc.roundedRect(L, doc.y + 1, 3, 13, 1.5).fill(C.accent);
    text(title, { x: L + 10, size: 13, font: F.b, color: C.ink, width: W - 10 });
    doc.y += 6;
  };
  const rich = (value) => {
    for (const b of richBlocks(value)) {
      const indent = b.type === 'li' ? 14 * b.level : 0;
      const size = b.type === 'h' ? 11 : 10;
      room(size + 10);
      if (b.type === 'h') doc.y += 4;
      if (b.type === 'li') text(b.marker, { x: L + indent - 11, size, color: C.accent, width: 12 }), doc.y -= doc.currentLineHeight(true);
      runs(b.runs, L + indent + (b.type === 'li' ? 2 : 0), W - indent - 2, size, b.type === 'h' ? C.ink : C.ink2, { b: b.type === 'h' });
      doc.y += b.type === 'li' ? 2 : 5;
    }
    doc.y += 6;
  };
  if (has('description') && course.description) { section('Course description'); text(course.description, { lineGap: 3 }); doc.y += 10; }
  if (has('objectives') && course.objectives) { section('What you’ll learn'); rich(course.objectives); }
  if (has('persona') && course.persona) { section('Who it’s for'); rich(course.persona); }
  if (has('prereqs') && course.prereqs) { section('Prerequisites'); rich(course.prereqs); }

  // --- outline: days > lessons > notes ---
  const lessons = has('outline') ? course.lessons || [] : [], times = has('lessonTimes');
  if (has('outline') && !lessons.length && course.topics) { section('Course topics'); rich(course.topics); }
  if (lessons.length) {
    const total = lessons.reduce((a, l) => a + (+l.mins || 0), 0), days = new Set(lessons.map((l) => l.day).filter(Boolean)).size;
    section('Course outline');
    text([days && `${days} days`, `${lessons.length} lessons`, times && total && fmtMins(total)].filter(Boolean).join(' · '), { size: 9, color: C.muted });
    doc.y += 8;
    // no days/units: a compact bullet list instead of numbered circles
    const compact = !days, ind = compact ? 14 : 26;
    let day = null;
    lessons.forEach((l, i) => {
      if ((l.day || '') !== (day || '') && l.day) {
        day = l.day;
        room(80);
        doc.y += 6;
        const [, tag, name] = l.day.match(DAY) || [null, '', l.day];
        const y = doc.y;
        doc.roundedRect(L, y, W, 26, 6).fill(C.accentSoft);
        let x = L + 10;
        if (tag) {
          const tw = doc.font(F.b).fontSize(8.5).widthOfString(safe(tag.toUpperCase())) + 14;
          doc.roundedRect(x, y + 6, tw, 14, 7).fill(C.accent);
          text(tag.toUpperCase(), { x: x + 7, y: y + 8.5, width: tw, size: 8.5, font: F.b, color: '#FFFFFF' });
          x += tw + 8;
        }
        text(name || l.day, { x, y: y + 7, width: L + W - x - 8, size: 11, font: F.b, color: C.accentInk, opts: { height: 14, ellipsis: true } });
        doc.y = y + 34;
      } else if (!l.day) day = null;

      // lesson heading
      const parts = noteParts(l.article).filter((p) => (p.kind === 'head' || p.kind === 'point' ? has('notes') : has('exercises')));
      room(compact ? 16 : 40);
      const y = doc.y;
      if (compact) {
        doc.circle(L + 4, y + 6.5, 2.2).fill(C.accent);
        text(l.title, { x: L + ind, y, width: W - ind - (times && l.mins ? 70 : 0), size: 10, color: C.ink });
      } else {
        doc.circle(L + 9, y + 7, 9).fill(C.accent);
        text(String(i + 1), { x: L, y: y + 2.5, width: 18, size: 8.5, font: F.b, color: '#FFFFFF', opts: { align: 'center' } });
        text(l.title, { x: L + ind, y, width: W - ind - 70, size: 11, font: F.b, color: C.ink });
      }
      const afterTitle = doc.y;
      if (times && l.mins) text(fmtMins(l.mins), { x: L + W - 70, y: y + (compact ? 0.5 : 1), width: 70, size: compact ? 8.5 : 9, color: C.muted, opts: { align: 'right' } });
      doc.y = afterTitle + (compact ? 1 : 4);

      for (const p of parts) {
        const x = L + ind, w = W - ind;
        if (p.kind === 'head') { room(20); doc.y += 3; text(p.text, { x, width: w, size: 10, font: F.b, color: C.ink }); doc.y += 2; }
        else if (p.kind === 'point') {
          const ind = p.level === 2 ? 14 : 0;
          room(16);
          text(p.level === 2 ? '◦' : '•', { x: x + ind, width: 10, size: 10, color: C.accent }); doc.y -= doc.currentLineHeight(true);
          text(p.text, { x: x + ind + 11, width: w - ind - 11, size: 9.5 });
          doc.y += 1.5;
        } else {
          // exercise box: label + title, then its details, on a tinted panel with an orange edge
          const pad = 9, iw = w - pad * 2 - 4;
          const label = p.label.toUpperCase() + '   ';
          const titleH = doc.font(F.b).fontSize(10).heightOfString(safe(label + p.title), { width: iw, lineGap: 2 });
          const detH = p.details.reduce((a, d) => a + doc.font(F.r).fontSize(9.5).heightOfString(safe(`${d.label ? d.label + ': ' : ''}${d.text}`), { width: iw, lineGap: 2 }) + 3, 0);
          const h = pad * 2 + titleH + (p.details.length ? detH + 3 : 0);
          room(h + 8);
          doc.y += 4;
          const by = doc.y;
          doc.roundedRect(x, by, w, h, 6).fillAndStroke(C.warnSoft, C.warnLine);
          doc.rect(x, by, 3.5, h).fill(C.warn);
          doc.y = by + pad;
          runs([{ text: label, b: true, color: C.warnInk }, { text: p.title, b: true }], x + pad + 4, iw, 10, C.ink);
          doc.y = by + pad + titleH + 3;
          for (const d of p.details) {
            runs([d.label && { text: d.label + ': ', b: true, color: C.warnInk }, { text: d.text }].filter(Boolean), x + pad + 4, iw, 9.5, C.ink2);
            doc.y += 3;
          }
          doc.y = by + h + 6;
        }
      }
      doc.y += compact ? (parts.length ? 6 : 3) : 10;
    });
  }

  // --- footer on every page ---
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    doc.moveTo(L, fy - 8).lineTo(L + W, fy - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    text(`Hazdemy  ·  ${course.code}  ·  ${course.name}`, { y: fy, width: W - 90, size: 8, color: C.muted, opts: { height: 10, ellipsis: true } });
    text(`Page ${p - range.start + 1} of ${range.count}`, { x: L + W - 90, y: fy, width: 90, size: 8, color: C.muted, opts: { align: 'right' } });
    doc.page.margins.bottom = keep;
  }
  doc.end();
}

/** Certificate of completion (A4 landscape) for one completed enrollment.
 *  cert.signers: the course instructors { name, title, signature } (right side); `signature` is a PNG/JPEG data URL.
 *  The completion date and certificate number go on the left. */
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FONT_DIR = path.join(ASSETS, 'fonts');
const SEAL = path.join(ASSETS, 'seal.png');
// Title font: Carol Gothic (a licensed font, so it isn't bundled). Put a copy in server/assets/fonts or install it
// on the server; without it the free UnifrakturMaguntia blackletter is used.
const CAROL = ['Carol Gothic W10 Regular.ttf', 'CarolGothicW10-Regular.ttf'];
const titleFontFile = () => [FONT_DIR, path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'), 'C:/Windows/Fonts', '/usr/share/fonts/truetype', '/usr/local/share/fonts', path.join(process.env.HOME || '', '.fonts')]
  .flatMap((dir) => CAROL.map((f) => path.join(dir, f))).find((f) => fs.existsSync(f));
const CERT = { brown: '#8A4115', orange: '#DD6B20', text: '#111111', grey: '#7A7A7A', rule: '#4A78C8', name: '#8A4115' };
const fontFile = (f) => { const p = path.join(FONT_DIR, f); return fs.existsSync(p) ? p : null; };
const imageOf = (dataUrl) => { const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(String(dataUrl || '')); return m ? Buffer.from(m[2], 'base64') : null; };

export function certificatePdf(cert, out) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate ${cert.number}`, Author: 'Hazdemy' } });
  const fonts = SYSTEM_FONTS ? { r: 'R', b: 'B', i: 'I' } : { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' };
  if (SYSTEM_FONTS) [['R', 0], ['B', 1], ['I', 2]].forEach(([n, k]) => doc.registerFont(n, SYSTEM_FONTS[k]));
  const carol = titleFontFile(), blackletter = carol || fontFile('UnifrakturMaguntia-Book.ttf'), script = fontFile('PinyonScript-Regular.ttf');
  if (blackletter) doc.registerFont('Title', blackletter);
  if (script) doc.registerFont('Script', script);
  doc.pipe(out);
  const W = doc.page.width, H = doc.page.height, cx = W / 2;
  const center = (t, y, size, font, color, opts = {}) => doc.font(font).fontSize(size).fillColor(color).text(safe(t), 50, y, { width: W - 100, align: 'center', lineBreak: false, ...opts });

  // frame: a thick and a thin brown border, both with notched corners
  const frame = (inset, r, width) => {
    const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
    doc.path(`M ${x0 + r} ${y0} L ${x1 - r} ${y0} A ${r} ${r} 0 0 0 ${x1} ${y0 + r} L ${x1} ${y1 - r} A ${r} ${r} 0 0 0 ${x1 - r} ${y1}`
      + ` L ${x0 + r} ${y1} A ${r} ${r} 0 0 0 ${x0} ${y1 - r} L ${x0} ${y0 + r} A ${r} ${r} 0 0 0 ${x0 + r} ${y0} Z`).lineWidth(width).strokeColor(CERT.brown).stroke();
  };
  frame(22, 24, 6.5);
  frame(33, 18, 1.4);

  // logos either side of a thin divider
  const logos = logoFiles();
  try { if (logos.left) doc.image(logos.left, cx - 18 - 112, 84, { fit: [112, 36], align: 'right', valign: 'center' }); } catch { /* unreadable logo */ }
  try { if (logos.right) doc.image(logos.right, cx + 18, 82, { fit: [84, 40], align: 'left', valign: 'center' }); } catch { /* unreadable logo */ }
  doc.moveTo(cx, 78).lineTo(cx, 126).lineWidth(0.8).strokeColor('#BDBDBD').stroke();

  center('Certificate of Completion', carol ? 140 : blackletter ? 140 : 148, carol ? 44 : blackletter ? 46 : 34, blackletter ? 'Title' : fonts.b, CERT.text);
  center('THIS CERTIFICATE IS PROUDLY PRESENTED TO', 204, 10.5, fonts.r, CERT.orange, { characterSpacing: 0.4 });

  // learner name in script (plain bold when the name uses letters the script font lacks), shrunk to fit the rule
  const useScript = script && !/[^\u0000-ɏ]/.test(cert.student);
  const nameFont = useScript ? 'Script' : fonts.b;
  let size = useScript ? 46 : 32;
  doc.font(nameFont);
  while (size > 20 && doc.fontSize(size).widthOfString(safe(cert.student)) > 520) size -= 1;
  center(cert.student, useScript ? 286 - size * 1.05 : 286 - size, size, nameFont, CERT.name);
  doc.moveTo(cx - 272, 292).lineTo(cx + 272, 292).lineWidth(0.8).strokeColor('#8EA5D2').stroke();

  center('for successfully completing the course', 312, 9.5, fonts.r, CERT.grey);
  // course name: up to two lines, smaller when long
  let cs = 24, ch;
  doc.font(fonts.b);
  for (; cs > 14; cs -= 1) { ch = doc.fontSize(cs).heightOfString(safe(cert.course), { width: 620, align: 'center' }); if (ch <= cs * 2.6) break; }
  doc.fillColor(CERT.text).text(safe(cert.course), cx - 310, 330, { width: 620, align: 'center' });

  // seal: server/assets/seal.png, or a drawn gold seal when that file is missing
  const sy = 470, R = 58;
  if (fs.existsSync(SEAL)) { try { doc.image(SEAL, cx - 66, sy - 66, { fit: [132, 132], align: 'center', valign: 'center' }); } catch { /* unreadable image */ } } else drawSeal();
  function drawSeal() {
  doc.save().circle(cx + 2, sy + 4, R).fillOpacity(0.07).fill('#000000').restore();
  const pts = [];
  for (let k = 0; k < 64; k++) { const a = (Math.PI * 2 * k) / 64, rr = k % 2 ? R - 4 : R + 1; pts.push([cx + rr * Math.cos(a), sy + rr * Math.sin(a)]); }
  const rays = doc.radialGradient(cx - 18, sy - 22, 4, cx, sy, R + 2);
  rays.stop(0, '#FFF1A8').stop(0.45, '#E9B53C').stop(1, '#A87412');
  doc.polygon(...pts).fill(rays);
  doc.circle(cx, sy, R - 12).lineWidth(3).strokeColor('#F6D77B').stroke();
  const disc = doc.radialGradient(cx - 10, sy - 12, 2, cx, sy, R - 14);
  disc.stop(0, '#E2AE3A').stop(1, '#A9760F');
  doc.circle(cx, sy, R - 14).fill(disc);
  doc.circle(cx, sy, R - 30).lineWidth(0.6).strokeColor('#F3D27A').stroke();
  const ring = 'certificate of Completion . ';
  doc.font('Courier').fontSize(7.6).fillColor('#3B2A06');
  [...ring].forEach((chr, k) => {
    doc.save().rotate((360 * k) / ring.length - 112, { origin: [cx, sy] });
    doc.text(chr, cx - 2.3, sy - (R - 18), { lineBreak: false });
    doc.restore();
  });
  }

  // bottom: date and certificate number on the left, every course instructor on the right
  const lineY = 488, GAP = 16;
  const block = (x, w, value, label, signature) => {
    const img = imageOf(signature);
    if (img) { try { doc.image(img, x, lineY - 46, { fit: [w, 42], align: 'center', valign: 'bottom' }); } catch { /* not a usable image */ } }
    doc.moveTo(x, lineY).lineTo(x + w, lineY).lineWidth(1.4).strokeColor(CERT.rule).stroke();
    let fs2 = 11.5;
    doc.font(fonts.b);
    while (fs2 > 8 && doc.fontSize(fs2).widthOfString(safe(value)) > w + 24) fs2 -= 0.5;
    doc.fillColor(CERT.text).text(safe(value), x - 12, lineY + 12, { width: w + 24, align: 'center', lineBreak: false, ellipsis: true });
    doc.font(fonts.r).fontSize(9.5).fillColor(CERT.grey).text(safe(label), x - 12, lineY + 30, { width: w + 24, align: 'center', lineBreak: false });
  };
  const left = 80, right = W - 80, inner = 80; // keep clear of the seal in the middle
  const done = new Date(cert.completed + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  // left: the date, and the certificate number on the next line, level with the middle of the seal
  [['Date', done], ['Certificate No.', cert.number]].forEach(([label, value], k) => {
    const y = sy - 16 + k * 18;
    doc.font(fonts.r).fontSize(10).fillColor(CERT.grey).text(`${label}: `, left, y, { continued: true, lineBreak: false });
    doc.font(fonts.b).fontSize(11).fillColor(CERT.text).text(safe(value), { lineBreak: false });
  });
  const signers = (cert.signers || []).length ? cert.signers : [{ name: 'Hazdemy Learning Services', title: 'Issued by' }];
  const room = right - (cx + inner), sw = Math.min(150, (room - GAP * (signers.length - 1)) / signers.length);
  signers.forEach((s, k) => block(right - (signers.length - k) * sw - (signers.length - 1 - k) * GAP, sw, s.name, s.title || 'Instructor', s.signature));
  doc.end();
}
