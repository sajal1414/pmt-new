import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { useToast } from '../lib/store.jsx';
import SignatureEditor from './SignatureEditor.jsx';

const W = 600, H = 200; // stored size; the certificate fits it into a 150 × 42 pt box above the line

/** "Certificate signature" card: draw with mouse/finger or upload a picture, then crop/adjust it in the editor. Saved straight away to `endpoint` (PUT { signature }).
 *  Used on the instructor's own profile and in the admin's instructor form (`bare` drops the card frame). */
export default function SignaturePad({ endpoint, preview, value, onSaved, bare, note = 'Printed above your name on the certificates of the courses you teach.' }) {
  const toast = useToast();
  const canvas = useRef(null);
  const file = useRef(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState(value ? 'show' : 'draw');
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // image being cropped/adjusted
  useEffect(() => { setMode(value ? 'show' : 'draw'); }, [value]);

  useEffect(() => {
    if (mode !== 'draw' || !canvas.current) return;
    const c = canvas.current, x = c.getContext('2d');
    x.clearRect(0, 0, W, H); x.lineWidth = 3.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#14214D';
    setDrawn(false);
  }, [mode]);

  const at = (e) => { const r = canvas.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
  const down = (e) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); drawing.current = true; const x = canvas.current.getContext('2d'), [px, py] = at(e); x.beginPath(); x.moveTo(px, py); x.lineTo(px + 0.1, py + 0.1); x.stroke(); setDrawn(true); };
  const move = (e) => { if (!drawing.current) return; const x = canvas.current.getContext('2d'), [px, py] = at(e); x.lineTo(px, py); x.stroke(); };
  const up = () => { drawing.current = false; };

  const store = async (signature) => {
    setBusy(true);
    try { await api.put(endpoint, { signature }); toast(signature ? 'Signature saved. It will appear on certificates.' : 'Signature removed'); onSaved(signature); return true; }
    catch (x) { toast(x.message); return false; } finally { setBusy(false); }
  };
  const closeEditor = () => { if (editing?.startsWith('blob:')) URL.revokeObjectURL(editing); setEditing(null); };
  const upload = (f) => {
    file.current.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type) && !/\.(png|jpe?g)$/i.test(f.name)) { toast('Choose a PNG or JPEG image.'); return; }
    if (f.size > 15 * 1024 * 1024) { toast('That image is too large (15 MB at most).'); return; }
    setEditing(URL.createObjectURL(f));
  };

  return (
    <section className={`sig-card${bare ? ' bare' : ' card'}`}>
      <div className="chead"><h2>Certificate signature</h2>{preview && <a className="linkbtn" href={preview} target="_blank" rel="noreferrer">Preview certificate</a>}</div>
      <p className="note" style={{ margin: 0 }}>{note}</p>
      {editing ? (
        <SignatureEditor src={editing} busy={busy} onCancel={closeEditor} onDone={async (d) => { if (await store(d)) closeEditor(); }} />
      ) : mode === 'show' ? (
        <div className="sig-box"><img src={value} alt="Your saved signature" /></div>
      ) : (
        <div className="sig-box draw">
          <canvas ref={canvas} width={W} height={H} aria-label="Signature drawing area: draw with your mouse, pen or finger" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          {!drawn && <span className="sig-hint">Sign here</span>}
          <span className="sig-line" aria-hidden="true" />
        </div>
      )}
      {!editing && <div className="actions">
        {mode === 'show' ? (<>
          <button className="btn sm" onClick={() => setEditing(value)} disabled={busy}><Icon name="edit" small />Edit (crop &amp; adjust)</button>
          <button className="btn sm" onClick={() => setMode('draw')} disabled={busy}><Icon name="edit" small />Draw a new one</button>
          <button className="btn sm" onClick={() => file.current.click()} disabled={busy}><Icon name="upload" small />Upload image</button>
          <button className="btn sm ad-no" onClick={() => store('')} disabled={busy}><Icon name="trash" small />Remove</button>
        </>) : (<>
          <button className="btn sm primary" onClick={() => store(canvas.current.toDataURL('image/png'))} disabled={!drawn || busy}><Icon name="save" small />{busy ? 'Saving…' : 'Save signature'}</button>
          <button className="btn sm" onClick={() => setEditing(canvas.current.toDataURL('image/png'))} disabled={!drawn || busy}><Icon name="edit" small />Crop &amp; adjust</button>
          <button className="btn sm" onClick={() => { canvas.current.getContext('2d').clearRect(0, 0, W, H); setDrawn(false); }} disabled={!drawn || busy}><Icon name="reset" small />Clear</button>
          <button className="btn sm" onClick={() => file.current.click()} disabled={busy}><Icon name="upload" small />Upload image</button>
          {value && <button className="btn sm" onClick={() => setMode('show')} disabled={busy}>Cancel</button>}
        </>)}
        <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => upload(e.target.files[0])} />
      </div>}
    </section>
  );
}
