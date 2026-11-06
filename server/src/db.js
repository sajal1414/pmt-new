// Data storage. The app works on one in-memory object (load()) and calls save() after each change.
// With DATABASE_URL set, the data lives in PostgreSQL: every list of records with ids (courses, users, students,
// enrollments, …) is its own table with one JSON row per record (stored as written, so field order is kept), and everything else (counters, settings, logs)
// sits in the "atlas_meta" table. save() writes only the rows that changed, in one transaction.
// Without DATABASE_URL it falls back to a JSON file (handy for local work and tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, sampleMode, emptyData } from './seed.js';

/** What a brand-new or reset site starts with: example data only when ATLAS_SAMPLE_DATA=1. */
const fresh = (old) => (sampleMode() ? seed() : emptyData(old?.users || []));

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_FILE = process.env.ATLAS_DATA || path.join(here, '..', 'data', 'atlas.json');
export const DATA_DIR = path.dirname(DATA_FILE);

let data = null;
let pool = null;        // pg.Pool when PostgreSQL is in use
let saved = null;       // what the database holds now (see snapshot)
let pending = false;    // a write is scheduled
let chain = Promise.resolve();

const usingPg = () => !!pool;
export const storage = () => (usingPg() ? `PostgreSQL (${dbLabel(process.env.DATABASE_URL)})` : DATA_FILE);
const dbLabel = (url) => { try { const u = new URL(url); return `${u.hostname}${u.pathname}`; } catch { return 'DATABASE_URL'; } };

/* ---------- start-up ---------- */

/** Connects to PostgreSQL when DATABASE_URL is set (creating the tables and, on first run, importing atlas.json). */
export async function init() {
  const url = process.env.DATABASE_URL;
  if (!url) { load(); return; }
  const { default: pg } = await import('pg');
  pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 30000 });
  pool.on('error', (e) => console.error('PostgreSQL connection error:', e.message));
  const enc = (await pool.query('show server_encoding')).rows[0].server_encoding;
  if (enc !== 'UTF8') throw new Error(`The PostgreSQL database uses ${enc} text encoding; Hazdemy needs UTF8. Create the database with ENCODING 'UTF8'.`);
  await pool.query('create table if not exists atlas_meta (key text primary key, value json not null)');
  data = await readAll();
  if (!data) {
    data = readFile() || fresh();
    saved = { meta: new Map(), rows: new Map() };
    await write(snapshot(data));
    console.log(`PostgreSQL was empty: ${fs.existsSync(DATA_FILE) ? `copied ${DATA_FILE} into it` : sampleMode() ? 'filled it with the sample data' : 'started with no data'}.`);
  } else saved = snapshot(data);
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, async () => { await flush(); process.exit(0); });
}

function readFile() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return null; }
}

export function load() {
  if (data) return data;
  data = readFile();
  if (!data) { data = fresh(); save(); }
  return data;
}

/* ---------- saving ---------- */

export function save() {
  if (!usingPg()) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DATA_FILE); // atomic replace, so a crash never leaves half a file
    return;
  }
  if (pending) return;           // several save() calls in one request become one write
  pending = true;
  setImmediate(() => { pending = false; chain = chain.then(() => write(snapshot(data))).catch(retry); });
}

function retry(e) {
  console.error('Saving to PostgreSQL failed, retrying in 5 s:', e.message);
  setTimeout(save, 5000);
}

/** Waits until everything saved so far is in the database. */
export async function flush() {
  if (!usingPg()) return;
  if (pending) await new Promise((r) => setImmediate(r));
  await chain;
}

export function reset() {
  data = fresh(data);
  save();
  return data;
}

/** Writes a JSON copy of the current data next to the data file (for undo before risky changes). */
export function backup(name) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(load(), null, 2));
  return file;
}

/** Replaces all data (e.g. restoring a backup). */
export function replaceAll(next) {
  data = next;
  save();
  return data;
}

export const uid = (prefix) => prefix + ++load().seq;

export function log(text) {
  const d = load();
  d.activity.unshift({ t: Date.now(), text, read: false });
  d.activity = d.activity.slice(0, 200);
}

/* ---------- PostgreSQL mapping ---------- */

// A top-level list becomes a table when every item is an object with its own unique id.
const isTable = (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && (typeof x.id === 'string' || typeof x.id === 'number'))
  && new Set(v.map((x) => String(x.id))).size === v.length;
const tableName = (key) => key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const SAFE = /^[a-z][a-z0-9_]*$/;

/** What would be stored for `d`: meta values and table rows, each as a JSON string so changes are easy to spot. */
function snapshot(d) {
  const meta = new Map(), rows = new Map();
  for (const [k, v] of Object.entries(d)) {
    if (isTable(v) && SAFE.test(tableName(k))) rows.set(k, new Map(v.map((x, i) => [String(x.id), { pos: i, json: JSON.stringify(x) }])));
    else meta.set(k, JSON.stringify(v));
  }
  meta.set('__tables', JSON.stringify([...rows.keys()]));
  return { meta, rows };
}

async function write(next) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    for (const [k, json] of next.meta) if (saved.meta.get(k) !== json) await c.query('insert into atlas_meta (key, value) values ($1, $2::json) on conflict (key) do update set value = excluded.value', [k, json]);
    const goneMeta = [...saved.meta.keys()].filter((k) => !next.meta.has(k));
    if (goneMeta.length) await c.query('delete from atlas_meta where key = any($1)', [goneMeta]);
    for (const k of new Set([...saved.rows.keys(), ...next.rows.keys()])) {
      const t = `"${tableName(k)}"`, before = saved.rows.get(k) || new Map(), after = next.rows.get(k) || new Map();
      if (!saved.rows.has(k)) await c.query(`create table if not exists ${t} (id text primary key, pos integer not null, data json not null)`);
      const changed = [...after].filter(([id, r]) => { const b = before.get(id); return !b || b.json !== r.json || b.pos !== r.pos; });
      if (changed.length) {
        await c.query(`insert into ${t} (id, pos, data) select * from unnest($1::text[], $2::int[], $3::json[])
          on conflict (id) do update set pos = excluded.pos, data = excluded.data`, [changed.map(([id]) => id), changed.map(([, r]) => r.pos), changed.map(([, r]) => r.json)]);
      }
      const gone = [...before.keys()].filter((id) => !after.has(id));
      if (!after.size && before.size) await c.query(`delete from ${t}`);
      else if (gone.length) await c.query(`delete from ${t} where id = any($1)`, [gone]);
    }
    await c.query('commit');
    saved = next;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally { c.release(); }
}

/** Reads everything back into one object, or null when the database is still empty. */
async function readAll() {
  const { rows } = await pool.query('select key, value from atlas_meta');
  if (!rows.length) return null;
  const d = {};
  for (const r of rows) d[r.key] = r.value;
  const tables = d.__tables || [];
  delete d.__tables;
  for (const k of tables) {
    if (!SAFE.test(tableName(k))) continue;
    const res = await pool.query(`select data from "${tableName(k)}" order by pos`).catch(() => ({ rows: [] }));
    d[k] = res.rows.map((r) => r.data);
  }
  return d;
}
