import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

// Series colours are validated categorical slots (see .t-chart tokens in styles.css): slot 1 blue,
// slot 2 orange, slot 3 aqua - assigned in that fixed order, never by rank. Text stays in ink colours.
const useWidth = () => {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};
/** Axis scale with whole, round steps (1, 2, 5 x 10^n): returns the top value and the tick values. */
const niceScale = (v, count = 4) => {
  const raw = Math.max(v, 1) / count, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
  const max = Math.ceil(Math.max(v, 1) / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, k) => k * step) };
};
const dayLabel = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmt = (n) => (n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

/** Multi-series line chart over days: legend, end labels, crosshair tooltip, table view. */
export function LineChart({ data, series, xKey = 'day', height = 260, title, sub, area = true }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const M = { t: 14, r: 92, b: 28, l: 44 }, H = height, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const { max, ticks } = niceScale(Math.max(...data.flatMap((d) => series.map((s) => d[s.key] || 0)), 0));
  const x = (i) => M.l + (data.length < 2 ? iw / 2 : (i / (data.length - 1)) * iw), y = (v) => M.t + ih - (v / max) * ih;
  const xt = useMemo(() => { const n = Math.min(7, data.length), out = []; for (let k = 0; k < n; k++) out.push(Math.round((k / Math.max(1, n - 1)) * (data.length - 1))); return [...new Set(out)]; }, [data.length]);
  const markers = data.length <= 45;
  // end labels: last value per series, nudged apart so they never overlap
  const ends = useMemo(() => {
    if (!data.length) return [];
    const last = data[data.length - 1];
    const ls = series.map((s) => ({ ...s, v: last[s.key] || 0, y: y(last[s.key] || 0) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ls.length; k++) if (ls[k].y - ls[k - 1].y < 15) ls[k].y = ls[k - 1].y + 15;
    // keep them inside the plot (above the date labels), pushing upward if needed
    const floor = M.t + ih - 4;
    if (ls.length && ls[ls.length - 1].y > floor) { ls[ls.length - 1].y = floor; for (let k = ls.length - 2; k >= 0; k--) if (ls[k + 1].y - ls[k].y < 15) ls[k].y = ls[k + 1].y - 15; }
    return ls;
  }, [data, series, max, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left;
    const i = Math.round(((px - M.l) / iw) * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };
  return (
    <div className="t-chart">
      <div className="t-ch-head">
        {title ? <h2>{title}</h2> : <span className="t-ch-sub">{sub}</span>}
        {title && sub && <span className="t-ch-sub">{sub}</span>}
        {series.length > 1 && <div className="t-legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>}
        <button className="icon-btn" onClick={() => setTable((t) => !t)} aria-pressed={table} title={table ? 'Show chart' : 'Show as table'} aria-label={table ? 'Show chart' : 'Show as table'}><Icon name={table ? 'chart' : 'table'} small /></button>
      </div>
      {table ? (
        <div className="tscroll t-ch-table"><table><thead><tr><th>Date</th>{series.map((s) => <th key={s.key} style={{ textAlign: 'right' }}>{s.label}</th>)}</tr></thead>
          <tbody>{data.map((d) => <tr key={d[xKey]}><td>{dayLabel(d[xKey])}</td>{series.map((s) => <td key={s.key} className="num" style={{ textAlign: 'right' }}>{(d[s.key] || 0).toLocaleString('en-US')}</td>)}</tr>)}</tbody></table></div>
      ) : (
        <div className="t-ch-wrap" ref={ref}>
          <svg width={W} height={H} role="img" aria-label={`${title || 'Chart'}: ${series.map((s) => s.label).join(', ')} per day`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => <g key={t}><line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} className="t-gl" /><text x={M.l - 8} y={y(t) + 4} className="t-axis" textAnchor="end">{fmt(t)}</text></g>)}
            {xt.map((i) => <text key={i} x={x(i)} y={H - 8} className="t-axis" textAnchor="middle">{dayLabel(data[i][xKey])}</text>)}
            {area && data.length > 1 && <path d={`M${x(0)},${y(0)} ` + data.map((d, i) => `L${x(i)},${y(d[series[0].key] || 0)}`).join(' ') + ` L${x(data.length - 1)},${y(0)} Z`} fill={series[0].color} opacity="0.07" />}
            {series.map((s) => <path key={s.key} d={data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[s.key] || 0)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
            {markers && series.map((s) => data.map((d, i) => <circle key={s.key + i} cx={x(i)} cy={y(d[s.key] || 0)} r="4" fill={s.color} className="t-dot" />))}
            {ends.map((s) => <g key={s.key}><circle cx={M.l + iw + 10} cy={s.y} r="3.5" fill={s.color} /><text x={M.l + iw + 18} y={s.y + 4} className="t-endl">{fmt(s.v)} {s.short || ''}</text></g>)}
            {hover != null && (<g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} className="t-cross" />
              {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key] || 0)} r="5" fill={s.color} className="t-dot" />)}
            </g>)}
            <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" />
          </svg>
          {hover != null && (
            <div className="t-tip" style={{ left: Math.min(x(hover) + 12, W - 180), top: M.t + 4 }}>
              <b>{dayLabel(data[hover][xKey])}</b>
              {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}<span className="num">{(data[hover][s.key] || 0).toLocaleString('en-US')}</span></div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Single-series vertical bars (one colour; the card title names the measure). */
export function BarChart({ data, height = 240, format = (v) => v, color = 'var(--s1)', label = 'Value' }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState(null);
  const M = { t: 12, r: 8, b: 28, l: 52 }, H = height, iw = W - M.l - M.r, ih = H - M.t - M.b;
  const { max, ticks } = niceScale(Math.max(...data.map((d) => d.value), 0));
  const slot = iw / Math.max(1, data.length), bw = Math.max(6, Math.min(44, slot - 2 - slot * 0.3));
  const y = (v) => M.t + ih - (v / max) * ih;
  return (
    <div className="t-ch-wrap" ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`${label}: ` + data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}>
        {ticks.map((t) => <g key={t}><line x1={M.l} x2={M.l + iw} y1={y(t)} y2={y(t)} className="t-gl" /><text x={M.l - 8} y={y(t) + 4} className="t-axis" textAnchor="end">{format(t)}</text></g>)}
        {data.map((d, i) => {
          const cx = M.l + slot * i + slot / 2, h = Math.max(0, M.t + ih - y(d.value)), r = Math.min(4, h / 2);
          const x0 = cx - bw / 2, top = M.t + ih - h;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={M.l + slot * i} y={M.t} width={slot} height={ih} fill="transparent" />
              {h > 0 && <path d={`M${x0},${M.t + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${M.t + ih} Z`} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
              <text x={cx} y={H - 8} className="t-axis" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && <div className="t-tip" style={{ left: Math.min(M.l + slot * hover + slot / 2 + 10, W - 150), top: Math.max(4, y(data[hover].value) - 10) }}><b>{data[hover].full || data[hover].label}</b><div>{label}<span className="num">{format(data[hover].value)}</span></div></div>}
    </div>
  );
}

/** Horizontal bars with the value beside each (ratings, funnels). */
export function HBars({ rows, color = 'var(--s1)', format = (v) => v.toLocaleString('en-US'), total }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="t-hbars">{rows.map((r) => (
      <div key={r.label} className="t-hbar" title={`${r.label}: ${format(r.value)}`}>
        <span className="lb">{r.label}</span>
        <span className="tr"><i style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
        <span className="v num">{format(r.value)}{total ? <small> · {Math.round((r.value / total) * 100)}%</small> : null}</span>
      </div>
    ))}</div>
  );
}

/**
 * Student engagement as small multiples: views (hundreds a day) and enrollments / completions (a few a day)
 * have very different scales, so each gets its own panel instead of sharing - or doubling - an axis.
 */
export function Engagement({ data, series }) {
  const [views, ...rest] = series;
  return (
    <div className="t-eng">
      <LineChart title="Student Engagement" sub={views.label} data={data} series={[views]} height={170} />
      <LineChart sub="Enrollments & completions" data={data} series={rest} height={140} area={false} />
    </div>
  );
}
