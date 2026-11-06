import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';
import { groupOf } from '../lib/constants.js';

/** Modal dialog built on the native <dialog> element (focus trap + Esc for free). */
export function Dialog({ open, title, subtitle, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby="dlgTitle" onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} style={wide ? { width: 'min(760px, calc(100vw - 32px))' } : undefined}>
      {open && (
        <div className="dlg">
          <div className="dlg-h">
            <div style={{ minWidth: 0 }}><h2 id="dlgTitle">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          {children && <div className="dlg-b">{children}</div>}
          {footer && <div className="dlg-f">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Confirm({ open, title, message, confirmLabel, onConfirm, onClose, busy }) {
  return (
    <Dialog open={open} title={title} subtitle={message} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger" onClick={onConfirm} disabled={busy}><Icon name="trash" small />{confirmLabel}</button></>} />
  );
}

/** Text / number / date / email / password input, select or textarea with label and error. */
export function Field({ id, label, value, onChange, type = 'text', options, required, error, placeholder, className = '', step, hideEmpty, labelClass }) {
  const v = value ?? '';
  const common = { id, 'aria-invalid': error ? 'true' : 'false', 'aria-describedby': error ? id + '-err' : undefined };
  let control;
  if (type === 'select') {
    const vals = options.map((o) => (typeof o === 'object' ? o.value : o));
    const list = (v && !vals.includes(v) ? [v] : []).concat(options);
    control = (
      <select {...common} value={v} onChange={(e) => onChange(e.target.value)}>
        {!required && !hideEmpty && <option value="">— Unspecified —</option>}
        {list.map((o) => (typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o}>{o}</option>))}
      </select>
    );
  } else if (type === 'textarea') {
    control = <textarea {...common} className="plain" value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const t = type === 'email' ? 'text' : type;
    control = <input {...common} type={t} inputMode={type === 'email' ? 'email' : undefined} autoComplete={type === 'password' ? 'new-password' : 'off'} step={step} value={v} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={`fg ${className}`}>
      <label htmlFor={id} className={labelClass}>{label}{required && <i aria-hidden="true" style={{ color: 'var(--red-ink)', fontStyle: 'normal' }}> *</i>}</label>
      {control}
      <span className="err" id={id + '-err'}>{error || ''}</span>
    </div>
  );
}

export function StatusPill({ status }) {
  const g = groupOf(status);
  return <span className={`pill ${g.tone}`}><span className="d" />{status || '—'}</span>;
}

export function Feedback({ rating }) {
  if (rating === '' || rating == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const n = Math.round(+rating);
  return <span className="stars" aria-label={`${rating} out of 5`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}<span>{(+rating).toFixed(1)}</span></span>;
}

export const Dash = () => <span style={{ color: 'var(--muted)' }}>—</span>;

/** Sortable, paginated table. cols: [{ key, label, sortable, render(row), sortValue(row) }] */
export function DataTable({ cols, rows, sort, onSort, page, size, onPage, onSize, onRowClick, actions, noun, empty, rowClass }) {
  const total = rows.length, pages = Math.max(1, Math.ceil(total / size)), cur = Math.min(page, pages);
  const start = (cur - 1) * size, slice = rows.slice(start, start + size);
  return (
    <section className="card tablecard">
      {total ? (
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                {cols.map((c) => {
                  if (!c.sortable) return <th key={c.key}>{c.label}</th>;
                  const on = sort.key === c.key;
                  return (
                    <th key={c.key} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                      <button onClick={() => onSort(c.key)}>{c.label}<Icon name={on ? (sort.dir > 0 ? 'up' : 'down') : 'sort'} small /></button>
                    </th>
                  );
                })}
                {actions && <th><span className="sr">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => (
                <tr key={r.id} className={[onRowClick && 'click', rowClass?.(r)].filter(Boolean).join(' ') || undefined} onClick={onRowClick ? (e) => { if (!e.target.closest('a,button,input')) onRowClick(r); } : undefined}>
                  {cols.map((c) => <td key={c.key} className={c.tdClass} style={c.tdStyle}>{c.render ? c.render(r) : r[c.key] || <Dash />}</td>)}
                  {actions && <td><div className="rowact">{actions(r)}</div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : empty}
      <div className="tfoot">
        <span className="num">{total ? `Showing ${start + 1}–${start + slice.length} of ${total} ${noun}` : `0 ${noun}`}</span>
        <div className="pager">
          <label htmlFor="psize" className="note">Rows</label>
          <select className="sel" id="psize" style={{ height: 34 }} value={size} onChange={(e) => onSize(+e.target.value)}>
            {[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </select>
          <button className="btn sm" onClick={() => onPage(cur - 1)} disabled={cur <= 1}><Icon name="left" small />Prev</button>
          <span className="num">Page {cur} of {pages}</span>
          <button className="btn sm" onClick={() => onPage(cur + 1)} disabled={cur >= pages}>Next<Icon name="right" small /></button>
        </div>
      </div>
    </section>
  );
}

/** Generic sort helper shared by pages. */
export function sortRows(rows, { key, dir }, getter) {
  const val = (r) => { let v = getter ? getter(r, key) : r[key]; if (Array.isArray(v)) v = v.join(','); return v === '' || v == null ? null : typeof v === 'number' ? v : String(v).toLowerCase(); };
  return [...rows].sort((a, b) => { const A = val(a), B = val(b); if (A === B) return 0; if (A == null) return 1; if (B == null) return -1; return (A > B ? 1 : -1) * dir; });
}

export function PageHead({ eyebrow, title, summary, actions }) {
  return (
    <section className="phead">
      <div className="tt"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{summary && <div className="summary">{summary}</div>}</div>
      <div className="actions">{actions}</div>
    </section>
  );
}

export function EmptyState({ title, text, action }) {
  return <div className="empty"><Icon name="filter" /><b>{title}</b>{text && <span>{text}</span>}{action}</div>;
}

export function downloadText(text, filename, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function toCSV(rows, keys) {
  const cell = (v) => { v = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [keys.join(',')].concat(rows.map((r) => keys.map((k) => cell(r[k])).join(','))).join('\n');
}
