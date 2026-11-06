import { useState } from 'react';
import Icon from './Icon.jsx';
import { ZONES, DEFAULT_COMPARE, localZone, zoneName, clock, timesIn, dateRange, shiftLabel } from '../lib/timezones.js';

const KEY = 'atlas-zones';
const readZones = () => { try { const z = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(z) && z.length ? z : DEFAULT_COMPARE; } catch { return DEFAULT_COMPARE; } };
export const STATUS_TONE = { Open: 'ok', 'Few seats left': 'warn', Full: 'red', Cancelled: 'gone' };

/** The time zones a viewer compares batches in: remembered in this browser, shared by every schedule list. */
export function useCompareZones() {
  const [zones, setZones] = useState(readZones);
  const update = (z) => { setZones(z); try { localStorage.setItem(KEY, JSON.stringify(z)); } catch { /* storage blocked */ } };
  return [zones, update];
}

/** One batch's class time in another zone, marked when it falls on the day before or after. */
function Converted({ b, tz, label, strong }) {
  const t = timesIn(b, tz);
  return (
    <li className={strong ? 'you' : ''}>
      <span className="z">{label || zoneName(tz)} <small>{t.abbr}</small></span>
      <b>{t.times}</b>
      {t.shift !== 0 && <span className="shift">{shiftLabel(t.shift)}</span>}
    </li>
  );
}

/** Batches still to come (not finished, not cancelled), soonest first. */
export const upcoming = (list) => {
  const today = new Date().toISOString().slice(0, 10);
  return (list || []).filter((b) => b.status !== 'Cancelled' && b.endDate >= today && b.startDate && b.startTime && b.endTime && b.timeZone)
    .sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));
};

/**
 * The next batch, shown along the top of a course page: dates, class time in the batch's zone and in the viewer's own,
 * plus a button to the full schedule. `none` is shown when nothing is scheduled (null hides the bar).
 */
export function NextBatchBar({ batches, onAll, allLabel, none = null, action }) {
  const list = upcoming(batches);
  if (!list.length) return none;
  const b = list[0], here = localZone(), own = timesIn(b, b.timeZone), mine = timesIn(b, here);
  const started = b.startDate <= new Date().toISOString().slice(0, 10);
  return (
    <section className="nb" aria-label="Next batch">
      <span className="nb-ico" aria-hidden="true"><Icon name="cal" /></span>
      <div className="nb-main">
        <span className="nb-k">{started ? 'Batch in progress' : 'Next batch'}{list.length > 1 && <span> · {list.length} scheduled</span>}</span>
        <b className="nb-date">{dateRange(b)}{b.days && <span className="note"> · {b.days}</span>}</b>
        <span className="nb-time">
          <span>{own.times} <b>{own.abbr}</b> <span className="note">({zoneName(b.timeZone)})</span></span>
          {here !== b.timeZone && <span className="nb-you">{mine.times} <b>{mine.abbr}</b> your time{mine.shift !== 0 && <em> · {shiftLabel(mine.shift)}</em>}</span>}
        </span>
      </div>
      <div className="nb-side">
        <span className="nb-tags"><span className={`pill ${STATUS_TONE[b.status] || 'gone'}`}>{b.status}</span><span className="pill gone">{b.mode}</span>{b.seats !== '' && b.seats != null && <span className="pill gone">{b.seats} seats</span>}</span>
        {action && action(b)}
        {onAll && <button type="button" className="btn sm" onClick={onAll}><Icon name="clock" small />{allLabel || (list.length > 1 ? `All ${list.length} batches & time zones` : 'Other time zones')}</button>}
      </div>
    </section>
  );
}

/** Zone chips with an "Add time zone" menu. */
export function ZonePicker({ zones, onChange }) {
  const here = localZone();
  const options = [...ZONES.map(([z]) => z), ...(ZONES.some(([z]) => z === here) ? [] : [here])].filter((z) => !zones.includes(z));
  return (
    <div className="bt-zones" role="group" aria-label="Time zones to compare">
      <span className="note">Also show in:</span>
      {zones.map((z) => (
        <span key={z} className="bt-chip">{zoneName(z)}<button type="button" onClick={() => onChange(zones.filter((x) => x !== z))} aria-label={`Stop showing ${zoneName(z)} time`} title="Remove"><Icon name="x" small /></button></span>
      ))}
      {options.length > 0 && zones.length < 10 && (
        <select className="sel bt-add" aria-label="Add a time zone" value="" onChange={(e) => e.target.value && onChange([...zones, e.target.value])}>
          <option value="">+ Add time zone</option>
          {options.map((z) => <option key={z} value={z}>{zoneName(z)}{z === here ? ' (your time)' : ''}</option>)}
        </select>
      )}
    </div>
  );
}

/**
 * Batches with their dates, class times in the batch's own zone, the viewer's local time and a row of other zones.
 * `actions(b, i)` adds buttons to each batch (the admin editor); `showNotes` shows internal notes.
 */
export default function BatchList({ batches, actions, showNotes, empty, head, shared }) {
  // `shared` = [zones, setZones] from a page with several lists, which shows the picker and footnote itself
  const own = useCompareZones(), [zones, setZones] = shared || own;
  const here = localZone();
  if (!batches.length) return empty || null;
  return (
    <div className="bt">
      {!shared && <ZonePicker zones={zones} onChange={setZones} />}
      <ul className="bt-list">
        {batches.map((b, i) => {
          const own = timesIn(b, b.timeZone);
          const others = zones.filter((z) => z !== b.timeZone && z !== here);
          return (
            <li key={b.id || i} className={`bt-item${b.status === 'Cancelled' ? ' off' : ''}`}>
              {head && head(b)}
              <div className="bt-top">
                <div className="bt-when">
                  <span className="bt-date"><Icon name="cal" small />{dateRange(b)}{b.days && <span className="note"> · {b.days}</span>}</span>
                  <span className="bt-time">{clock(b.startTime)} – {clock(b.endTime)} <b>{own.abbr}</b> <span className="note">({zoneName(b.timeZone)} time)</span></span>
                </div>
                <div className="bt-tags">
                  <span className={`pill ${STATUS_TONE[b.status] || 'gone'}`}>{b.status}</span>
                  <span className="pill gone">{b.mode}</span>
                  {b.seats !== '' && b.seats != null && <span className="pill gone">{b.booked != null ? `${Math.max(0, b.seats - b.booked)} of ${b.seats} seats left` : `${b.seats} seats`}</span>}
                </div>
              </div>
              {(b.location || b.instructor) && <p className="bt-meta">{b.instructor && <span><Icon name="user" small />{b.instructor}</span>}{b.location && <span><Icon name="globe" small />{b.location}</span>}</p>}
              <ul className="bt-conv">
                {here !== b.timeZone && <Converted b={b} tz={here} label="Your time" strong />}
                {others.map((z) => <Converted key={z} b={b} tz={z} />)}
              </ul>
              {showNotes && b.learners?.length > 0 && <p className="bt-notes" title={b.learners.join(', ')}><Icon name="people" small />{b.learners.length} learner{b.learners.length === 1 ? '' : 's'}: {b.learners.slice(0, 3).join(', ')}{b.learners.length > 3 ? ` and ${b.learners.length - 3} more` : ''}</p>}
              {showNotes && b.notes && <p className="bt-notes"><Icon name="file" small />{b.notes}</p>}
              {actions && <div className="bt-act">{actions(b, i)}</div>}
            </li>
          );
        })}
      </ul>
      {!shared && <p className="note" style={{ margin: 0 }}>Times in other zones are for the first class day; daylight-saving changes during a long batch can move them by an hour.</p>}
    </div>
  );
}
