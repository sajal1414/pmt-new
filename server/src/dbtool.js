// Copy data between the JSON file and PostgreSQL.
//   npm run db:export -- backup.json   writes everything to a JSON file
//   npm run db:import -- atlas.json    replaces everything with a JSON file (the current data is backed up first)
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env.js';
import { init, load, replaceAll, backup, flush, storage } from './db.js';

loadEnv();
const [cmd, file] = process.argv.slice(2);
if (!['export', 'import'].includes(cmd) || !file) {
  console.log('Usage: node src/dbtool.js export <file.json> | import <file.json>');
  process.exit(1);
}
await init();
if (cmd === 'export') {
  fs.writeFileSync(file, JSON.stringify(load(), null, 2));
  console.log(`Exported ${storage()} to ${path.resolve(file)}`);
} else {
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!next || !Array.isArray(next.courses)) throw new Error('That file doesn’t look like Hazdemy data (no courses list).');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  console.log('Backup of the current data: ' + backup(`atlas.backup-before-import-${stamp}.json`));
  replaceAll(next);
  await flush();
  console.log(`Imported ${path.resolve(file)} into ${storage()}`);
}
process.exit(0);
