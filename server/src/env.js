// server/.env holds local settings such as payment keys and DATABASE_URL (see .env.example); real environment variables win.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  try {
    const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* no .env file: defaults apply */ }
}
