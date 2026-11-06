import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

/* Signature image editor: rotate/straighten, crop (drag the frame or its corners), remove the paper background,
   recolour the ink, then export a trimmed PNG no bigger than OUT_W × OUT_H. Everything runs in the browser. */

const OUT_W = 600, OUT_H = 200;   // stored size (the certificate fits it into a 150 × 42 pt box)
const MAX = 1000;                 // working resolution: big photos are scaled down to this on the long side
const INKS = [['original', 'Original'], ['#14214D', 'Dark blue'], ['#111111', 'Black']];
const DEFAULTS = { quarter: 0, tilt: 0, bg: 14, ink: 'original', dark: 0 };
const HANDLE = 14;                // corner hit area, in preview pixels

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That file isn’t an image we can read.'));
  img.src = src;
});

/** The image turned by quarter turns plus a small tilt, on a canvas big enough to hold it. */
function rotated(img, quarter, tilt) {
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = img.width * k, h = img.height * k, a = ((quarter * 90 + tilt) * Math.PI) / 180;
  const cw = Math.ceil(Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))), ch = Math.ceil(Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, cw, ch); // corners uncovered by a tilt count as paper
  x.translate(cw / 2, ch / 2); x.rotate(a); x.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/** Paper → transparent, ink → chosen colour/darkness. `bg` 0–60: how light a pixel can be and still count as ink. */
function processed(src, { bg, ink, dark }) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height), d = px.data;
  const cut = 255 - bg * 2.2, soft = 24, rgb = ink === 'original' ? null : [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  const k = 1 - dark / 120;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const alpha = bg ? Math.max(0, Math.min(1, (cut - lum) / soft)) : 1; // soft edge instead of a hard cut-off
    d[i + 3] = Math.round(d[i + 3] * alpha);
    if (rgb) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; } else { d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  }
  x.putImageData(px, 0, 0);
  return c;
}

/** Bounding box of visible pixels (alpha > 24), or null when the image is empty. */
function inkBox(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const clampCrop = (r, W, H) => {
  const w = Math.max(20, Math.min(r.w, W)), h = Math.max(12, Math.min(r.h, H));
  return { x: Math.max(0, Math.min(r.x, W - w)), y: Math.max(0, Math.min(r.y, H - h)), w, h };
};

export default function SignatureEditor({ src, busy, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [o, setO] = useState(DEFAULTS);
  const [crop, setCrop] = useState(null);
  const view = useRef(null);
  const drag = useRef(null);

  useEffect(() => { let live = true; loadImage(src).then((i) => live && setImg(i)).catch((e) => live && setError(e.message)); return () => { live = false; }; }, [src]);

  const base = useMemo(() => (img ? rotated(img, o.quarter, o.tilt) : null), [img, o.quarter, o.tilt]);
  const out = useMemo(() => (base ? processed(base, o) : null), [base, o.bg, o.ink, o.dark]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new rotation starts with the crop fitted to the ink
  useEffect(() => { if (out) { const b = inkBox(out); setCrop(b ? clampCrop({ x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 }, out.width, out.height) : { x: 0, y: 0, w: out.width, h: out.height }); } }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  // preview: checkerboard (shows what is transparent), the processed image, and the crop frame
  useEffect(() => {
    const c = view.current;
    if (!c || !out || !crop) return;
    c.width = out.width; c.height = out.height;
    const x = c.getContext('2d'), s = 12;
    for (let yy = 0; yy < c.height; yy += s) for (let xx = 0; xx < c.width; xx += s) { x.fillStyle = (xx / s + yy / s) % 2 ? '#F1ECEB' : '#FFFFFF'; x.fillRect(xx, yy, s, s); }
    x.drawImage(out, 0, 0);
    x.fillStyle = 'rgba(30, 10, 10, .45)';
    x.fillRect(0, 0, c.width, crop.y); x.fillRect(0, crop.y + crop.h, c.width, c.height - crop.y - crop.h);
    x.fillRect(0, crop.y, crop.x, crop.h); x.fillRect(crop.x + crop.w, crop.y, c.width - crop.x - crop.w, crop.h);
    const k = c.width / c.getBoundingClientRect().width || 1;
    x.setLineDash([6 * k, 4 * k]); x.lineWidth = 2 * k; x.strokeStyle = '#8E1B1E'; x.strokeRect(crop.x, crop.y, crop.w, crop.h); x.setLineDash([]);
    x.fillStyle = '#8E1B1E';
    for (const [hx, hy] of [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]]) x.fillRect(hx - 5 * k, hy - 5 * k, 10 * k, 10 * k);
  }, [out, crop]);

  const at = (e) => { const r = view.current.getBoundingClientRect(), k = view.current.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k }; };
  const down = (e) => {
    if (!crop) return;
    const p = at(e), near = (a, b) => Math.abs(a - b) <= HANDLE * p.k;
    const corner = [['nw', crop.x, crop.y], ['ne', crop.x + crop.w, crop.y], ['sw', crop.x, crop.y + crop.h], ['se', crop.x + crop.w, crop.y + crop.h]].find(([, hx, hy]) => near(p.x, hx) && near(p.y, hy));
    const inside = p.x > crop.x && p.x < crop.x + crop.w && p.y > crop.y && p.y < crop.y + crop.h;
    if (!corner && !inside) return;
    e.preventDefault(); view.current.setPointerCapture(e.pointerId);
    drag.current = { kind: corner ? corner[0] : 'move', start: p, from: crop };
  };
  const move = (e) => {
    const g = drag.current;
    if (!g) return;
    const p = at(e), dx = p.x - g.start.x, dy = p.y - g.start.y, f = g.from;
    let r = { ...f };
    if (g.kind === 'move') r = { ...f, x: f.x + dx, y: f.y + dy };
    if (g.kind.includes('w')) { r.x = Math.min(f.x + dx, f.x + f.w - 20); r.w = f.w - (r.x - f.x); }
    if (g.kind.includes('e')) r.w = f.w + dx;
    if (g.kind.includes('n')) { r.y = Math.min(f.y + dy, f.y + f.h - 12); r.h = f.h - (r.y - f.y); }
    if (g.kind.includes('s')) r.h = f.h + dy;
    setCrop(clampCrop(r, out.width, out.height));
  };
  const up = () => { drag.current = null; };
  const nudge = (e) => { // keyboard: arrows move the frame, shift+arrows resize it
    if (!crop || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const s = 6, dx = e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, dy = e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0;
    setCrop(clampCrop(e.shiftKey ? { ...crop, w: crop.w + dx, h: crop.h + dy } : { ...crop, x: crop.x + dx, y: crop.y + dy }, out.width, out.height));
  };

  const autoCrop = () => { const b = inkBox(out); if (b) setCrop(clampCrop({ x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 }, out.width, out.height)); };
  const done = () => {
    const c = document.createElement('canvas'); c.width = Math.round(crop.w); c.height = Math.round(crop.h);
    c.getContext('2d').drawImage(out, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    const b = inkBox(c) || { x: 0, y: 0, w: c.width, h: c.height }, pad = 6;
    const sx = Math.max(0, b.x - pad), sy = Math.max(0, b.y - pad), sw = Math.min(c.width - sx, b.w + pad * 2), sh = Math.min(c.height - sy, b.h + pad * 2);
    const k = Math.min(1, OUT_W / sw, OUT_H / sh), f = document.createElement('canvas');
    f.width = Math.max(1, Math.round(sw * k)); f.height = Math.max(1, Math.round(sh * k));
    const x = f.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, sx, sy, sw, sh, 0, 0, f.width, f.height);
    onDone(f.toDataURL('image/png'));
  };
  const set = (k) => (v) => setO((s) => ({ ...s, [k]: v }));

  if (error) return <div className="sig-edit"><p className="note" role="alert" style={{ color: 'var(--red-ink)' }}>{error}</p><div className="actions"><button className="btn sm" onClick={onCancel}>Back</button></div></div>;
  if (!out || !crop) return <div className="sig-edit"><p className="note">Opening the image…</p></div>;
  return (
    <div className="sig-edit">
      <div className="sig-stage">
        <canvas ref={view} tabIndex={0} aria-label="Signature crop area: drag the frame or its corners; arrow keys move it, Shift with arrows resizes it"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={nudge} />
      </div>
      <div className="sig-tools">
        <div className="sig-row">
          <span className="lbl">Rotate</span>
          <button type="button" className="btn sm" onClick={() => setO((s) => ({ ...s, quarter: (s.quarter + 3) % 4 }))} aria-label="Rotate left"><Icon name="reset" small />Left</button>
          <button type="button" className="btn sm" onClick={() => setO((s) => ({ ...s, quarter: (s.quarter + 1) % 4 }))} aria-label="Rotate right"><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="reset" small /></span>Right</button>
          <button type="button" className="btn sm" onClick={autoCrop}><Icon name="target" small />Auto-crop</button>
        </div>
        <label className="sig-row" htmlFor="sg-tilt"><span className="lbl">Straighten</span><input id="sg-tilt" type="range" min="-15" max="15" step="0.5" value={o.tilt} onChange={(e) => set('tilt')(+e.target.value)} /><span className="val">{o.tilt > 0 ? '+' : ''}{o.tilt}°</span></label>
        <label className="sig-row" htmlFor="sg-bg"><span className="lbl">Remove background</span><input id="sg-bg" type="range" min="0" max="60" value={o.bg} onChange={(e) => set('bg')(+e.target.value)} /><span className="val">{o.bg ? o.bg : 'Off'}</span></label>
        <div className="sig-row"><span className="lbl">Ink colour</span>
          <div className="seg-row" role="group" aria-label="Ink colour">{INKS.map(([v, l]) => <button key={v} type="button" className="seg" aria-pressed={o.ink === v} onClick={() => set('ink')(v)}>{v !== 'original' && <i className="sig-dot" style={{ background: v }} />}{l}</button>)}</div>
        </div>
        {o.ink === 'original' && <label className="sig-row" htmlFor="sg-dark"><span className="lbl">Darken ink</span><input id="sg-dark" type="range" min="0" max="80" value={o.dark} onChange={(e) => set('dark')(+e.target.value)} /><span className="val">{o.dark}</span></label>}
      </div>
      <div className="actions">
        <button type="button" className="btn sm primary" onClick={done} disabled={busy}><Icon name="save" small />{busy ? 'Saving…' : 'Save signature'}</button>
        <button type="button" className="btn sm" onClick={() => setO(DEFAULTS)} disabled={busy}><Icon name="reset" small />Reset</button>
        <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
