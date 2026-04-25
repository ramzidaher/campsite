#!/usr/bin/env node
/**
 * Regenerates reports/incident/k6-token-static-users.csv from ussu-password-import.csv.
 * Sequential logins with small delay to avoid auth rate limits.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const inPath = path.join(root, 'scripts/ussu-provision-output/ussu-password-import.csv');
const outPath = path.join(root, 'reports/incident/k6-token-static-users.csv');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  '';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = i + 1 < line.length ? line[i + 1] : '';
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email, password) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        signal: ac.signal,
        headers: {
          apikey: PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      clearTimeout(timer);
      const t = await r.text();
      if (r.status === 200) {
        const j = JSON.parse(t);
        if (j.access_token) return j.access_token;
      }
      if (r.status === 429 || r.status >= 500) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw new Error(`login ${r.status}: ${t.slice(0, 120)}`);
    } catch (e) {
      if (attempt === 10) throw e;
      await sleep(300 * 2 ** attempt);
    }
  }
  throw new Error('login exhausted');
}

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  console.error('Set SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and anon/publishable key env vars');
  process.exit(1);
}

const raw = fs.readFileSync(inPath, 'utf8').split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(raw[0]).map((x) => x.trim().toLowerCase());
const ni = header.indexOf('name');
const ui = header.indexOf('url');
const ei = header.indexOf('username');
const pi = header.indexOf('password');
const rows = [];
for (let i = 1; i < raw.length; i += 1) {
  const cols = parseCsvLine(raw[i]);
  const name = cols[ni] ?? '';
  const url = cols[ui] ?? '';
  const email = (cols[ei] ?? '').trim();
  const pass = (cols[pi] ?? '').trim();
  if (!email || !pass) continue;
  const token = await login(email, pass);
  rows.push([name, url, email, token]);
  process.stdout.write(`.\n`);
  await sleep(100);
}

const out = [
  'name,url,username,access_token',
  ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
].join('\n');
fs.writeFileSync(outPath, `${out}\n`, 'utf8');
console.log(`Wrote ${rows.length} rows -> ${outPath}`);
