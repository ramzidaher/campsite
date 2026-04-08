/**
 * Writes scripts/qa-login-import.csv for password-manager import (local + production login URLs).
 * Reads persona keys from seed-qa-full.mjs (STAFF + FIXTURE_USERS).
 *
 *   node scripts/generate-qa-login-csv.mjs
 *
 * Password: CAMPSITE_QA_PASSWORD from env, or seed default CampSiteQA2026!
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const p = join(root, '.env');
  try {
    const s = readFileSync(p, 'utf8');
    for (const line of s.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

const src = readFileSync(join(__dirname, 'seed-qa-full.mjs'), 'utf8');
const staffMatch = src.match(/const STAFF = (\[[\s\S]*?\n\];)/);
const fixMatch = src.match(/const FIXTURE_USERS = (\[[\s\S]*?\n\];)/);
if (!staffMatch || !fixMatch) throw new Error('Could not parse STAFF / FIXTURE_USERS from seed-qa-full.mjs');

const STAFF = eval(staffMatch[1].replace(/;$/, ''));
const FIXTURE_USERS = eval(fixMatch[1].replace(/;$/, ''));

function emailFor(key) {
  return `campsite-qa-${key.replace(/_/g, '-')}@example.com`;
}

function esc(s) {
  const t = String(s ?? '');
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const password = process.env.CAMPSITE_QA_PASSWORD?.trim() || 'CampSiteQA2026!';
const urls = [
  ['local', 'http://localhost:3000/login'],
  ['production', 'https://camp-site.co.uk/login'],
];

const rows = [['environment', 'name', 'url', 'username', 'password', 'notes']];
const note =
  'CampSite QA seed; shared password for all rows unless you changed CAMPSITE_QA_PASSWORD when seeding.';

for (const p of STAFF) {
  const u = emailFor(p.key);
  for (const [env, url] of urls) {
    rows.push([env, p.fullName, url, u, password, note]);
  }
}
for (const p of FIXTURE_USERS) {
  const u = emailFor(p.key);
  for (const [env, url] of urls) {
    rows.push([env, p.fullName, url, u, password, note]);
  }
}

const csv = rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
const out = join(__dirname, 'qa-login-import.csv');
writeFileSync(out, csv, 'utf8');
console.log('Wrote', out, '(', rows.length - 1, 'credential rows )');
