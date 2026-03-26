/**
 * Inserts a row into public.platform_admins (founder console access).
 *
 * Requires repo root `.env`:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service_role JWT from Supabase → API)
 *
 * Usage:
 *   node scripts/add-platform-founder.mjs <auth-user-uuid>
 *
 * Equivalent SQL (run in Supabase → SQL Editor if you prefer):
 *   insert into public.platform_admins (user_id)
 *   values ('<uuid>')
 *   on conflict (user_id) do nothing;
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDotEnv() {
  const p = join(root, '.env');
  if (!existsSync(p)) return;
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
}

loadDotEnv();

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const userId = (process.argv[2] || '').trim();
  if (!uuidRe.test(userId)) {
    console.error('Usage: node scripts/add-platform-founder.mjs <auth-user-uuid>');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env\n\n' +
        'Or run this SQL in Supabase → SQL Editor:\n\n' +
        `  insert into public.platform_admins (user_id)\n  values ('${userId}')\n  on conflict (user_id) do nothing;`
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.from('platform_admins').insert({ user_id: userId });
  if (error) {
    if (/duplicate|unique|already exists/i.test(error.message)) {
      console.log('Already a founder admin:', userId);
      return;
    }
    console.error('Insert failed:', error.message);
    process.exit(1);
  }
  console.log('Added founder admin:', userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
