/**
 * Creates or updates a Supabase Auth user and sets profiles.role = org_admin.
 *
 * Requires (repo root .env or environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← Dashboard → Project Settings → API → service_role (secret)
 *
 * Optional:
 *   CAMPSITE_SUPER_ADMIN_EMAIL
 *   CAMPSITE_SUPER_ADMIN_PASSWORD
 *   CAMPSITE_SUPER_ADMIN_NAME    (default: founder name from email local part)
 *   CAMPSITE_ORG_SLUG            (default: common-ground-studios)
 *   CAMPSITE_ORG_NAME            (default: Common Ground Studios)
 *   CAMPSITE_ORG_ID              (optional UUID — skip org insert if set)
 *
 * The API key MUST be the service_role secret (JWT `role` = service_role), not the anon key.
 * If you see "row-level security policy" on organisations, you pasted the wrong key.
 *
 * Usage:
 *   node scripts/create-super-admin.mjs
 *
 * Or one-off:
 *   CAMPSITE_SUPER_ADMIN_EMAIL=you@x.com CAMPSITE_SUPER_ADMIN_PASSWORD='...' node scripts/create-super-admin.mjs
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

/** @returns {'service_role' | 'anon' | null} */
function jwtRole(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload.role === 'service_role'
      ? 'service_role'
      : payload.role === 'anon'
        ? 'anon'
        : null;
  } catch {
    return null;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email =
  process.env.CAMPSITE_SUPER_ADMIN_EMAIL || process.argv[2] || '';
const password =
  process.env.CAMPSITE_SUPER_ADMIN_PASSWORD || process.argv[3] || '';
const orgSlug = process.env.CAMPSITE_ORG_SLUG || 'common-ground-studios';
const orgName = process.env.CAMPSITE_ORG_NAME || 'Common Ground Studios';
const orgIdEnv = process.env.CAMPSITE_ORG_ID?.trim() || '';
const fullName =
  process.env.CAMPSITE_SUPER_ADMIN_NAME ||
  (email ? email.split('@')[0].replace(/[._]/g, ' ') : 'Super Admin');

async function main() {
  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Add the service_role key from Supabase → Project Settings → API (keep it secret; never commit it).'
    );
    process.exit(1);
  }
  if (!email || !password) {
    console.error(
      'Set CAMPSITE_SUPER_ADMIN_EMAIL and CAMPSITE_SUPER_ADMIN_PASSWORD,\n' +
        'or run: node scripts/create-super-admin.mjs you@org.com "your-password"'
    );
    process.exit(1);
  }

  if (serviceKey.startsWith('sb_publishable')) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY looks like a publishable key. You need the long JWT labelled service_role in Supabase → Project Settings → API.'
    );
    process.exit(1);
  }

  const keyRole = jwtRole(serviceKey);
  if (keyRole !== 'service_role') {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT (Dashboard → Project Settings → API).\n' +
        'You likely pasted the anon / public key — that key cannot insert organisations (RLS will block).\n' +
        `Detected JWT role: ${keyRole ?? 'unknown (not a Supabase JWT?)'}`
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let org;

  if (orgIdEnv) {
    const { data: existing, error: exErr } = await supabase
      .from('organisations')
      .select('id')
      .eq('id', orgIdEnv)
      .maybeSingle();
    if (exErr || !existing) {
      console.error('CAMPSITE_ORG_ID not found:', orgIdEnv, exErr?.message);
      process.exit(1);
    }
    org = existing;
    console.log('Using existing organisation id:', org.id);
  } else {
    let { data: row } = await supabase
      .from('organisations')
      .select('id')
      .eq('slug', orgSlug)
      .maybeSingle();

    if (!row) {
      const { data: inserted, error: orgErr } = await supabase
        .from('organisations')
        .insert({ name: orgName, slug: orgSlug, is_active: true })
        .select('id')
        .single();
      if (orgErr) {
        console.error('Organisation insert failed:', orgErr.message);
        if (/row-level security|RLS/i.test(orgErr.message)) {
          console.error(
            '\n→ Fix: use the service_role key from Supabase API settings (not the anon key).\n'
          );
        }
        process.exit(1);
      }
      row = inserted;
    }
    org = row;
  }

  let userId;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    const msg = createErr.message || '';
    if (!/already|registered|exists/i.test(msg)) {
      console.error('createUser failed:', createErr);
      process.exit(1);
    }
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      console.error('listUsers failed:', listErr);
      process.exit(1);
    }
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) {
      console.error('User exists but could not be found by email. Set password in Dashboard → Auth.');
      process.exit(1);
    }
    userId = found.id;
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error('updateUserById failed:', updErr);
      process.exit(1);
    }
    console.log('Updated existing auth user:', email);
  } else {
    userId = created.user.id;
    console.log('Created auth user:', email);
  }

  const { error: profErr } = await supabase.from('profiles').upsert(
    {
      id: userId,
      org_id: org.id,
      full_name: fullName,
      email,
      role: 'org_admin',
      status: 'active',
    },
    { onConflict: 'id' }
  );

  if (profErr) {
    console.error('profiles upsert failed:', profErr);
    process.exit(1);
  }

  console.log('Profile set to org_admin, active, org:', orgSlug);
  console.log('Done. Log in at /login with', email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
