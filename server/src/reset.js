// npm run reset: removes all data, keeping the admin accounts (with ATLAS_SAMPLE_DATA=1: the sample data instead).
// In PostgreSQL when DATABASE_URL is set.
import { loadEnv } from './env.js';
import { init, reset, flush, backup, storage } from './db.js';
import { sampleMode } from './seed.js';

loadEnv();
await init();
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
console.log('Backup of the current data: ' + backup(`atlas.backup-before-reset-${stamp}.json`));
reset();
await flush();
console.log((sampleMode() ? 'Sample data restored in ' : 'All data removed (admin accounts kept) in ') + storage());
process.exit(0);
