// Course catalog -> one PDF (A4 portrait): courses grouped Vendor > Platform > Portfolio > Product, each shown as a row
// with the code in a box, the name, a details line (IBM code, duration, modality, status, instructor), tags and a link.
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { pdfKit } from './pdf.js';

/** What a catalog can show; the dialog on the Courses pages switches each on or off. */
// tags are picked one by one: portfolio, product, level, vendor ('tags' = all four, from older saved choices)
export const TAG_FIELDS = ['tagPortfolio', 'tagProduct', 'tagLevel', 'tagVendor'];
export const CATALOG_FIELDS = ['hideVendor', 'contents', 'ibmCode', 'duration', 'delivery', 'status', 'instructors', 'tags', ...TAG_FIELDS, 'description', 'link'];
export const CATALOG_DEFAULTS = ['contents', 'ibmCode', 'duration', 'delivery', 'status', 'instructors', ...TAG_FIELDS, 'link'];
/** Compares platform names by their place in `list` (as arranged in the Catalog window); platforms not in it go after, A–Z. */
const platformRank = (list) => {
  const at = new Map((Array.isArray(list) ? list : []).map((p, i) => [String(p).trim().toLowerCase(), i]));
  const rank = (p) => (at.has(String(p).trim().toLowerCase()) ? at.get(String(p).trim().toLowerCase()) : 1e6);
  return (a, b) => rank(a) - rank(b);
};
const fieldSet = (fields) => new Set(fields.includes('tags') ? [...fields, ...TAG_FIELDS] : fields);
// kept so older callers that send `columns` still work
export const CATALOG_COLUMNS = CATALOG_FIELDS;

const STATUS_TONE = [
  [['Available', 'Published'], '#E7F6EF', '#0B7A4F'],
  [['Pipeline', 'Backlog'], '#F8E9E8', '#8E1B1E'],
  [['Retired'], '#F4EDEB', '#6B5552']
];
const toneOf = (s) => STATUS_TONE.find(([list]) => list.includes(s)) || [null, '#FFF3E6', '#C2410C'];
const TAG_TONES = [['#F8E9E8', '#8E1B1E'], ['#F1EBFF', '#6D28D9'], ['#E3F3F3', '#0E8A8A'], ['#F4EDEB', '#5F4543']];
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const durationOf = (c) => (c.duration !== '' && c.duration != null && +c.duration ? `${c.duration} day${+c.duration === 1 ? '' : 's'}` : c.hours ? `${c.hours} h` : '');

// small line icons, drawn in a 24-unit box like the app's icons
const ICONS = {
  doc: (d) => { d.path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z').stroke(); d.path('M14 2v6h6').stroke(); d.path('M8 13h8M8 17h5').stroke(); },
  clock: (d) => { d.circle(12, 12, 9).stroke(); d.path('M12 7v5l3 2').stroke(); },
  monitor: (d) => { d.roundedRect(3, 4, 18, 12, 2).stroke(); d.path('M8 20h8M12 16v4').stroke(); },
  user: (d) => { d.circle(12, 8, 4).stroke(); d.path('M4 21a8 8 0 0 1 16 0').stroke(); },
  arrow: (d) => { d.path('M5 12h14').stroke(); d.path('m13 6 6 6-6 6').stroke(); }
};

/**
 * `fields` picks what each course shows (see CATALOG_FIELDS); `subtitle` is no longer printed;
 * `baseUrl` makes "View Details" open the course in ATLAS.
 */
export function catalogPdf(courses, { title = 'Course Catalog', subtitle = '', fields = CATALOG_DEFAULTS, baseUrl = '', platformOrder = [] } = {}, out) {
  const { F, C, safe, logoFiles, setupFonts } = pdfKit;
  const on = fieldSet(fields);
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 54, bottom: 64, left: 46, right: 46 }, bufferPages: true, info: { Title: title, Author: 'Hazdemy', Subject: 'Course catalog' } });
  setupFonts(doc);
  doc.pipe(out);
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const text = (t, o = {}) => doc.font(o.font || F.r).fontSize(o.size || 10).fillColor(o.color || C.ink2).text(safe(t), o.x ?? L, o.y ?? doc.y, { width: o.width ?? W, lineGap: o.lineGap ?? 1.5, ...o.opts });
  const icon = (name, x, y, size, color) => { doc.save().translate(x, y).scale(size / 24).lineWidth(2).lineCap('round').lineJoin('round').strokeColor(color); ICONS[name](doc); doc.restore(); };
  const widthOf = (t, font, size) => doc.font(font).fontSize(size).widthOfString(safe(t));

  // vendor > platform > portfolio > product; empty values sort last, courses by code
  // "Leave out vendors": one group for everything, so the catalog starts at platforms
  const noVendor = on.has('hideVendor');
  const key = (v) => String(v ?? '').trim();
  const order = (a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b));
  const tree = new Map();
  for (const c of courses) {
    let node = tree;
    [noVendor ? '' : key(c.vendor), key(c.platform), key(c.portfolio), key(c.product)].forEach((k, i) => { if (!node.has(k)) node.set(k, i < 3 ? new Map() : []); node = node.get(k); });
    node.push(c);
  }
  const sorted = (m) => [...m.keys()].sort(order);
  // contents links: each points straight at a page and position (works in every PDF viewer, unlike named destinations)
  const dest = (...path) => path.join('|');
  const pageNo = () => { const r = doc.bufferedPageRange(); return r.start + r.count - 1; };
  const targets = new Map(), links = []; // name -> { page, y } · { page, x, y, w, h, name }
  const place = (name, y) => targets.set(name, { page: pageNo(), y });
  const linkTo = (name, x, y, w, h) => links.push({ page: pageNo(), x, y, w, h, name });
  const byPlatform = platformRank(platformOrder);
  const sortedPlatforms = (m) => [...m.keys()].sort((a, b) => byPlatform(a, b) || order(a, b)); // the order chosen in the Catalog window
  const label = (v, what) => v || `(${what} not set)`;
  const count = (n) => (Array.isArray(n) ? n.length : [...n.values()].reduce((a, x) => a + count(x), 0));

  // --- first page: logos, title band, contents ---
  const logos = logoFiles();
  const stripH = logos.left || logos.right ? 66 : 0, logoH = 42, logoW = 150;
  const logo = (file, x, align) => { try { doc.image(file, x, (stripH - logoH) / 2, { fit: [logoW, logoH], align, valign: 'center' }); } catch { /* unreadable image */ } };
  if (logos.left) logo(logos.left, L, 'left');
  if (logos.right) logo(logos.right, L + W - logoW, 'right');
  const bandH = 104, top = stripH;
  // light band with dark text, a brand-red rule underneath
  doc.rect(0, top, doc.page.width, bandH).fill('#F6EBE8');
  doc.rect(0, top + bandH - 3, doc.page.width, 3).fill(C.accent);
  text('HAZDEMY · LEARNING SERVICES', { y: top + 26, size: 8, font: F.b, color: C.accent, opts: { characterSpacing: 1.2 } });
  text(title, { y: top + 42, size: 22, font: F.b, color: C.ink });
  // just the course count under the title (no description of the selection, no date)
  text(`${courses.length} course${courses.length === 1 ? '' : 's'}`, { y: top + 74, size: 9.5, font: F.b, color: C.ink2 });
  doc.y = top + bandH + 20;
  if (on.has('contents')) {
    text('CONTENTS', { size: 8, font: F.b, color: C.muted, opts: { characterSpacing: 0.8 } });
    doc.y += 4;
    // with vendors: each vendor and its platforms; without: each platform and its portfolios
    // every heading and item is a link to its section further on
    const lines = noVendor ? sortedPlatforms(tree.get('') || new Map()).map((p) => [label(p, 'Platform'), tree.get('').get(p), 'Portfolio', ['', p]]) : sorted(tree).map((v) => [label(v, 'Vendor'), tree.get(v), 'Platform', [v]]);
    for (const [name, node, inner, path] of lines) {
      if (doc.y + 30 > bottom()) doc.addPage();
      const y = doc.y;
      text(name, { y, size: 11, font: F.b, color: C.ink, width: W - 60 });
      text(String(count(node)), { x: L + W - 60, y, width: 60, size: 11, font: F.b, color: C.accentInk, opts: { align: 'right' } });
      linkTo(dest(...path), L, y - 1, W, 14); // the whole heading line (stops above the items)
      doc.y = y + 16;
      // the items, laid out one by one so each has its own link area
      const keys = inner === 'Platform' ? sortedPlatforms(node) : sorted(node), sep = '   ·   ', lh = 13;
      let x = L, iy = doc.y;
      keys.forEach((k, i) => {
        const item = `${label(k, inner)} (${count(node.get(k))})`, w = widthOf(item, F.r, 9), sw = i < keys.length - 1 ? widthOf(sep, F.r, 9) : 0;
        if (x > L && x + w > L + W) { x = L; iy += lh; }
        text(item, { x, y: iy, size: 9, color: C.muted, width: w + 2, opts: { lineBreak: false } });
        linkTo(dest(...path, k), x - 1, iy - 2, w + 2, lh);
        x += w;
        if (sw) { text(sep, { x, y: iy, size: 9, color: C.muted, width: sw + 2, opts: { lineBreak: false } }); x += sw; }
      });
      doc.y = iy + lh;
      doc.y += 8;
    }
    doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y += 18;
  }

  // --- course rows ---
  const codeW = 88, x0 = L + codeW + 18, linkW = on.has('link') && baseUrl ? 92 : 0, cw = W - (x0 - L) - (linkW ? linkW + 12 : 4);
  const headLabel = ['Course name', ...[['ibmCode', 'IBM code'], ['duration', 'Duration'], ['delivery', 'Modality'], ['status', 'Status'], ['instructors', 'Instructor']].filter(([k]) => on.has(k)).map(([, l]) => l)];
  const tableHead = () => {
    const y = doc.y;
    doc.roundedRect(L, y, W, 20, 5).fill(C.accentSoft);
    text('COURSE #', { x: L + 10, y: y + 6, width: codeW, size: 7.5, font: F.b, color: C.accentInk, opts: { characterSpacing: 0.5 } });
    text(headLabel.map((h) => h.toUpperCase()).join(headLabel.length > 1 ? '  ·  ' : ''), { x: x0, y: y + 6, width: W - (x0 - L), size: 7.5, font: F.b, color: C.accentInk, opts: { characterSpacing: 0.4, lineBreak: false, ellipsis: true } });
    doc.y = y + 26;
  };

  /** Measure one course row and return its height plus a function that draws it at a given y. */
  const row = (c) => {
    const nameH = doc.font(F.b).fontSize(11).heightOfString(safe(c.name || 'Untitled course'), { width: cw });
    const desc = on.has('description') ? plain(c.description).slice(0, 260) : '';
    const descH = desc ? Math.min(doc.font(F.r).fontSize(8.5).heightOfString(safe(desc), { width: cw }), 24) + 3 : 0;
    // details line: icon + text items, the status as a pill; wraps onto more lines when needed
    const items = [];
    if (on.has('ibmCode') && key(c.ibmCode)) items.push({ icon: 'doc', t: `IBM: ${key(c.ibmCode)}` });
    if (on.has('duration') && durationOf(c)) items.push({ icon: 'clock', t: durationOf(c) });
    if (on.has('delivery') && key(c.delivery)) items.push({ icon: 'monitor', t: key(c.delivery) });
    if (on.has('status') && key(c.status)) items.push({ pill: true, t: key(c.status) });
    if (on.has('instructors') && (c.instructors || []).length) items.push({ icon: 'user', t: `Instructor: ${c.instructors.join(', ')}` });
    const metaLines = [[]];
    let lineW = 0;
    for (const it of items) {
      it.w = it.pill ? widthOf(it.t, F.b, 8) + 20 : 13 + widthOf(it.t, F.r, 8.5);
      if (lineW && lineW + 17 + it.w > cw) { metaLines.push([]); lineW = 0; }
      metaLines[metaLines.length - 1].push(it); lineW += (lineW ? 17 : 0) + it.w;
    }
    const metaH = items.length ? metaLines.length * 17 + 3 : 0;
    // tags, each kind in its own colour: portfolio, product, skill level, vendor (only the ones chosen)
    const tagTone = new Map();
    [['tagPortfolio', c.portfolio, 0], ['tagProduct', c.product, 1], ['tagLevel', c.skill, 2], ['tagVendor', on.has('hideVendor') ? '' : c.vendor, 3]]
      .forEach(([f, v, tone]) => { const t = key(v); if (on.has(f) && t && !tagTone.has(t)) tagTone.set(t, tone); });
    const tags = [...tagTone.keys()];
    const tagLines = [[]];
    let tagW = 0;
    for (const t of tags) { const w = widthOf(t, F.b, 8) + 16; if (tagW && tagW + 6 + w > cw) { tagLines.push([]); tagW = 0; } tagLines[tagLines.length - 1].push({ t, w }); tagW += (tagW ? 6 : 0) + w; }
    const tagsH = tags.length ? tagLines.length * 20 + 2 : 0;
    const h = Math.max(46, 10 + nameH + 4 + descH + metaH + tagsH + 8);
    const draw = (y) => {
      // code box and divider
      doc.roundedRect(L, y + 4, codeW, h - 10, 6).fill('#FAF1EF');
      text(c.code || '—', { x: L + 9, y: y + 13, width: codeW - 14, size: 10, font: F.b, color: C.accentInk });
      doc.moveTo(L + codeW + 9, y + 6).lineTo(L + codeW + 9, y + h - 8).lineWidth(0.75).strokeColor(C.line).stroke();
      // name, description
      let cy = y + 10;
      text(c.name || 'Untitled course', { x: x0, y: cy, width: cw, size: 11, font: F.b, color: C.ink });
      cy += nameH + 4;
      if (desc) { text(desc, { x: x0, y: cy, width: cw, size: 8.5, color: C.muted, opts: { height: 24, ellipsis: true } }); cy += descH; }
      // details
      for (const line of items.length ? metaLines : []) {
        let x = x0;
        line.forEach((it, k) => {
          if (k) { doc.moveTo(x + 8, cy + 3).lineTo(x + 8, cy + 12).lineWidth(0.6).strokeColor(C.line).stroke(); x += 17; }
          if (it.pill) {
            const [, bg, ink] = toneOf(it.t);
            doc.roundedRect(x, cy - 1, it.w, 16, 8).fill(bg);
            doc.circle(x + 8, cy + 7, 2.4).fill(ink);
            text(it.t, { x: x + 14, y: cy + 2, width: it.w - 14, size: 8, font: F.b, color: ink, opts: { lineBreak: false } });
          } else {
            icon(it.icon, x, cy + 1, 10, C.muted);
            text(it.t, { x: x + 13, y: cy + 2, width: it.w - 13 + 2, size: 8.5, color: C.ink2, opts: { lineBreak: false } });
          }
          x += it.w;
        });
        cy += 17;
      }
      if (items.length) cy += 3;
      // tags
      for (const line of tags.length ? tagLines : []) {
        let x = x0;
        line.forEach(({ t, w }, k) => {
          const [bg, ink] = TAG_TONES[tagTone.get(t) % TAG_TONES.length];
          doc.roundedRect(x, cy, w, 16, 5).fill(bg);
          text(t, { x: x + 8, y: cy + 4, width: w - 10, size: 8, font: F.b, color: ink, opts: { lineBreak: false } });
          x += w + 6;
          if (k === line.length - 1) cy += 20;
        });
      }
      // view details button, linked to the course in ATLAS
      if (linkW) {
        const bx = L + W - linkW, by = y + 5; // top of the row, level with the course name
        doc.roundedRect(bx, by, linkW, 26, 6).fill(C.accent);
        text('View Details', { x: bx + 10, y: by + 8.5, width: linkW - 26, size: 8.5, font: F.b, color: '#FFFFFF', opts: { lineBreak: false } });
        icon('arrow', bx + linkW - 19, by + 8, 10, '#FFFFFF');
        doc.link(bx, by, linkW, 26, `${baseUrl}/learn/courses/${c.id}`);
      }
      doc.moveTo(L, y + h - 1).lineTo(L + W, y + h - 1).lineWidth(0.5).strokeColor(C.line).stroke();
    };
    return { h, draw };
  };

  let ctx = null; // the group a list is running in: repeated, with the header row, after a page break
  const room = (h) => {
    if (doc.y + h <= bottom()) return;
    doc.addPage();
    if (ctx) { text(`${ctx}  (continued)`, { size: 8.5, font: F.b, color: C.muted }); doc.y += 4; tableHead(); }
  };

  for (const v of sorted(tree)) {
    const vn = tree.get(v);
    ctx = null; room(130);
    if (!noVendor) { // the red vendor band
      const vy = doc.y;
      doc.roundedRect(L, vy, W, 30, 6).fill(C.accent);
      place(dest(v), vy);
      text(label(v, 'Vendor'), { x: L + 12, y: vy + 8, size: 13, font: F.b, color: '#FFFFFF', width: W - 130 });
      text(`${count(vn)} course${count(vn) === 1 ? '' : 's'}`, { x: L + W - 112, y: vy + 10, width: 100, size: 9, font: F.b, color: '#F8E9E8', opts: { align: 'right' } });
      doc.y = vy + 40;
    }
    for (const p of sortedPlatforms(vn)) {
      const pn = vn.get(p);
      ctx = null; room(110);
      place(dest(v, p), doc.y);
      text(label(p, 'Platform'), { size: 12, font: F.b, color: C.accentInk });
      doc.moveTo(L, doc.y + 1).lineTo(L + W, doc.y + 1).lineWidth(0.75).strokeColor(C.accent).stroke();
      doc.y += 8;
      for (const pf of sorted(pn)) {
        const fn = pn.get(pf);
        ctx = null; room(90);
        const py = doc.y;
        text('PORTFOLIO', { y: py, size: 8.5, font: F.b, color: C.muted, opts: { characterSpacing: 0.5, lineBreak: false } });
        const pw = widthOf('PORTFOLIO', F.b, 8.5) + 4.5;
        text('›', { x: L + pw + 4, y: py - 1, size: 9.5, font: F.b, color: C.muted, opts: { lineBreak: false } });
        place(dest(v, p, pf), py);
        text(label(pf, 'Portfolio'), { x: L + pw + 16, y: py - 1, size: 10, font: F.b, color: C.accentInk, width: W - pw - 16 });
        doc.y += 5;
        // no product headings: the portfolio's courses in one table, by product and then course code
        const list = sorted(fn).flatMap((pr) => fn.get(pr).slice().sort((a, b) => String(a.code).localeCompare(String(b.code))));
        const first = row(list[0]);
        ctx = null; room(30 + first.h);
        ctx = [!noVendor && label(v, 'Vendor'), label(p, 'Platform'), label(pf, 'Portfolio')].filter(Boolean).join('  ›  ');
        tableHead();
        list.forEach((c, i) => {
          const r = i ? row(c) : first;
          room(r.h);
          const y = doc.y;
          r.draw(y);
          doc.y = y + r.h + 2;
        });
        ctx = null;
        doc.y += 10;
      }
      doc.y += 4;
    }
    doc.y += 6;
  }

  // --- footer on every page ---
  for (const l of links) {
    const t = targets.get(l.name);
    if (!t) continue;
    doc.switchToPage(l.page);
    const to = doc._pageBuffer[t.page]; // the target page: an explicit destination, scrolled to just above the heading
    doc.annotate(l.x, l.y, l.w, l.h, { Subtype: 'Link', Border: [0, 0, 0], Dest: [to.dictionary, 'XYZ', null, to.height - t.y + 8, null] });
  }
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    const keep = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    doc.moveTo(L, fy - 8).lineTo(L + W, fy - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    text(`Hazdemy  ·  ${title}`, { y: fy, width: W - 90, size: 8, color: C.muted, opts: { height: 10, ellipsis: true } });
    text(`Page ${p - range.start + 1} of ${range.count}`, { x: L + W - 90, y: fy, width: 90, size: 8, color: C.muted, opts: { align: 'right' } });
    doc.page.margins.bottom = keep;
  }
  doc.end();
}

/**
 * The same catalog as an Excel workbook: a "Catalog" sheet (one row per course, grouping columns first, filter and
 * frozen header) and a "Summary" sheet with course counts per vendor and platform.
 */
export function catalogXlsx(courses, { title = 'Course Catalog', subtitle = '', fields = CATALOG_DEFAULTS, baseUrl = '', platformOrder = [] } = {}) {
  const on = fieldSet(fields), key = (v) => String(v ?? '').trim();
  const order = (a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b));
  const byPlatform = platformRank(platformOrder);
  const list = [...courses].sort((a, b) => order(key(a.vendor), key(b.vendor)) || byPlatform(key(a.platform), key(b.platform)) || order(key(a.platform), key(b.platform)) || order(key(a.portfolio), key(b.portfolio))
    || order(key(a.product), key(b.product)) || String(a.code).localeCompare(String(b.code)));
  const cols = [...(on.has('hideVendor') ? [] : [['Vendor', 16, (c) => key(c.vendor)]]), ['Platform', 18, (c) => key(c.platform)], ['Portfolio', 22, (c) => key(c.portfolio)], ['Product', 26, (c) => key(c.product)],
    ['Course #', 14, (c) => key(c.code)], ['Course name', 60, (c) => key(c.name)]];
  if (on.has('ibmCode')) cols.push(['IBM code', 14, (c) => key(c.ibmCode)]);
  if (on.has('duration')) cols.push(['Duration', 11, (c) => durationOf(c)]);
  if (on.has('delivery')) cols.push(['Modality', 11, (c) => key(c.delivery)]);
  if (on.has('status')) cols.push(['Status', 16, (c) => key(c.status)]);
  if (on.has('instructors')) cols.push(['Instructor', 30, (c) => (c.instructors || []).join(', ')]);
  if (on.has('tagLevel')) cols.push(['Level', 14, (c) => key(c.skill)]);
  if (on.has('description')) cols.push(['Description', 70, (c) => plain(c.description)]);
  if (on.has('link') && baseUrl) cols.push(['Link', 16, () => 'View details']);

  const top = [[title], [`${list.length} course${list.length === 1 ? '' : 's'}`], []];
  const head = top.length;
  const ws = XLSX.utils.aoa_to_sheet([...top, cols.map(([h]) => h), ...list.map((c) => cols.map(([, , get]) => get(c)))]);
  ws['!cols'] = cols.map(([, w]) => ({ wch: w }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: head, c: 0 }, e: { r: head + list.length, c: cols.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: head + 1 };
  ws['!views'] = [{ state: 'frozen', ySplit: head + 1, topLeftCell: XLSX.utils.encode_cell({ r: head + 1, c: 0 }) }];
  const linkCol = cols.findIndex(([h]) => h === 'Link');
  if (linkCol >= 0) list.forEach((c, i) => { const cell = ws[XLSX.utils.encode_cell({ r: head + 1 + i, c: linkCol })]; if (cell) cell.l = { Target: `${baseUrl}/learn/courses/${c.id}`, Tooltip: 'Open the course in Hazdemy' }; });

  // summary: vendor > platform counts
  const counts = new Map();
  for (const c of list) { const k = `${on.has('hideVendor') ? '' : key(c.vendor) || '(Vendor not set)'}\u0000${key(c.platform) || '(Platform not set)'}`; counts.set(k, (counts.get(k) || 0) + 1); }
  const unset = (v) => (v.startsWith('(') ? '' : v); // "(… not set)" sorts last, like the PDF
  const sumRows = [...counts].map(([k, n]) => [...k.split('\u0000'), n]).sort((a, b) => order(unset(a[0]), unset(b[0])) || order(unset(a[1]), unset(b[1])));
  const sum = XLSX.utils.aoa_to_sheet(on.has('hideVendor')
    ? [['Platform', 'Courses'], ...sumRows.map(([, p, n]) => [p, n]), [], ['Total', list.length]]
    : [['Vendor', 'Platform', 'Courses'], ...sumRows, [], ['Total', '', list.length]]);
  sum['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');
  wb.Props = { Title: title, Author: 'Hazdemy' };
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
