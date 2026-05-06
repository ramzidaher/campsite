/**
 * Seeds a demo organisation with many roles for access-level testing.
 *
 * Requires (.env at repo root):
 *   NEXT_PUBLIC_SUPABASE_URL  (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Environment (optional):
 *   CAMPSITE_DEMO_ORG_SLUG   default: demo-access-lab
 *   CAMPSITE_DEMO_ORG_NAME   default: Demo Access Lab
 *   CAMPSITE_DEMO_PASSWORD   default: DemoAccess2026!  (same for every seeded user this run)
 *
 * Usage:
 *   node scripts/seed-demo-org.mjs --plan     # print org tree + credential plan only (no API calls)
 *   node scripts/seed-demo-org.mjs            # print tree, then create org + users in Supabase
 *
 * If the organisation slug already exists, the script exits with an error (avoid duplicate noise).
 * Delete the org in the dashboard or pick a new CAMPSITE_DEMO_ORG_SLUG.
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
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

function randomEmailTag() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Department keys used in the plan; resolved to UUIDs after insert.
 * @typedef {'ops' | 'programs' | 'guest' | 'society'} DeptKey
 */

/** @type {{ key: DeptKey; name: string; type: 'department' | 'society' }[]} */
const DEPT_SPECS = [
  { key: 'ops', name: 'Operations', type: 'department' },
  { key: 'programs', name: 'Programs', type: 'department' },
  { key: 'guest', name: 'Guest Services', type: 'department' },
  { key: 'society', name: 'Alumni Society', type: 'society' },
];

/**
 * @typedef {Object} PersonPlan
 * @property {string} label
 * @property {string} role
 * @property {DeptKey[]} memberOf   user_departments
 * @property {DeptKey[]} manages    dept_managers (only for managers)
 */

/** @type {PersonPlan[]} */
const PEOPLE = [
  { label: 'Org Admin (primary)', role: 'org_admin', memberOf: [], manages: [] },
  { label: 'Org Admin (secondary)', role: 'org_admin', memberOf: [], manages: [] },
  { label: 'Manager  Ops', role: 'manager', memberOf: ['ops'], manages: ['ops'] },
  { label: 'Manager  Programs', role: 'manager', memberOf: ['programs'], manages: ['programs'] },
  { label: 'Manager  Guest', role: 'manager', memberOf: ['guest'], manages: ['guest'] },
  { label: 'Manager  Ops + Programs', role: 'manager', memberOf: ['ops', 'programs'], manages: ['ops', 'programs'] },
  { label: 'Coordinator  Ops', role: 'coordinator', memberOf: ['ops'], manages: [] },
  { label: 'Coordinator  Programs', role: 'coordinator', memberOf: ['programs'], manages: [] },
  { label: 'Coordinator  Ops (overlap)', role: 'coordinator', memberOf: ['ops'], manages: [] },
  { label: 'Duty manager  Guest', role: 'duty_manager', memberOf: ['guest'], manages: [] },
  { label: 'Duty manager  Programs', role: 'duty_manager', memberOf: ['programs'], manages: [] },
  { label: 'Administrator  Ops', role: 'administrator', memberOf: ['ops'], manages: [] },
  { label: 'Administrator  Programs', role: 'administrator', memberOf: ['programs'], manages: [] },
  { label: 'CSA  Ops A', role: 'csa', memberOf: ['ops'], manages: [] },
  { label: 'CSA  Ops B', role: 'csa', memberOf: ['ops'], manages: [] },
  { label: 'CSA  Programs', role: 'csa', memberOf: ['programs'], manages: [] },
  { label: 'CSA  Guest', role: 'csa', memberOf: ['guest'], manages: [] },
  { label: 'Leader  Alumni Society', role: 'society_leader', memberOf: ['society'], manages: [] },
];

function printOrgTree() {
  console.log(`
┌─ Demo organisation (CAMPSITE_DEMO_ORG_NAME / slug)
│
├── Teams (departments)
│   ├── Operations
│   ├── Programs
│   ├── Guest Services
│   └── Alumni Society (type: society)
│
├── org_admin × 2
│   └── (no team rows  full-org scope)
│
├── manager × 4  (+ dept_managers + same teams in user_departments)
│   ├── → Operations
│   ├── → Programs
│   ├── → Guest Services
│   └── → Operations + Programs
│
├── coordinator × 3  (user_departments only)
│   ├── → Operations
│   ├── → Programs
│   └── → Operations  (second coord  overlap with first for approval tests)
│
├── duty_manager × 2
│   ├── → Guest Services
│   └── → Programs
│
├── administrator × 2
│   ├── → Operations
│   └── → Programs
│
├── csa × 4
│   ├── → Operations (×2)
│   ├── → Programs
│   └── → Guest Services
│
└── society_leader × 1
    └── → Alumni Society

Totals: 18 active users · 4 teams
`);
}

function slugifySegment(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} email
 * @param {string} password
 */
async function ensureAuthUser(supabase, email, password) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr && created?.user?.id) {
    return created.user.id;
  }

  const msg = createErr?.message || '';
  if (!/already|registered|exists/i.test(msg)) {
    throw new Error(`createUser failed (${email}): ${msg || JSON.stringify(createErr)}`);
  }

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
    if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
    const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: updErr } = await supabase.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
      });
      if (updErr) throw new Error(`updateUserById failed: ${updErr.message}`);
      return found.id;
    }
    if (!list.users.length || list.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`User exists but could not resolve id for ${email}`);
}

async function main() {
  const planOnly = process.argv.includes('--plan');

  printOrgTree();

  const tag = randomEmailTag();
  const sharedPassword =
    process.env.CAMPSITE_DEMO_PASSWORD?.trim() || 'DemoAccess2026!';
  const orgSlug = process.env.CAMPSITE_DEMO_ORG_SLUG?.trim() || 'demo-access-lab';
  const orgName = process.env.CAMPSITE_DEMO_ORG_NAME?.trim() || 'Demo Access Lab';

  const rows = PEOPLE.map((p, i) => {
    const seg = slugifySegment(p.label) || `user-${i + 1}`;
    const email = `demo.${seg}.${tag}@example.com`;
    const fullName = p.label;
    return { ...p, email, fullName, password: sharedPassword };
  });

  console.log('Planned logins (copy after run  emails are random per invocation):\n');
  console.log('role\temail\tpassword\tteams');
  for (const r of rows) {
    const teams = [...r.memberOf, ...r.manages].filter((v, j, a) => a.indexOf(v) === j);
    console.log(`${r.role}\t${r.email}\t${r.password}\t${teams.join(', ') || ''}`);
  }
  console.log('');

  if (planOnly) {
    console.log('(--plan: no Supabase calls made)\n');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Use --plan to preview only, or add service_role to .env for apply.'
    );
    process.exit(1);
  }

  if (serviceKey.startsWith('sb_publishable')) {
    console.error('SUPABASE_SERVICE_ROLE_KEY looks like a publishable key; need service_role JWT.');
    process.exit(1);
  }

  if (jwtRole(serviceKey) !== 'service_role') {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT from Supabase → Project Settings → API.'
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingOrg, error: exOrgErr } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (exOrgErr) {
    console.error('organisations lookup failed:', exOrgErr.message);
    process.exit(1);
  }

  if (existingOrg) {
    console.error(
      `Organisation slug already exists: ${orgSlug}\n` +
        'Remove it in Supabase or set CAMPSITE_DEMO_ORG_SLUG to a new value.'
    );
    process.exit(1);
  }

  const { data: orgRow, error: orgErr } = await supabase
    .from('organisations')
    .insert({ name: orgName, slug: orgSlug, is_active: true })
    .select('id')
    .single();

  if (orgErr || !orgRow) {
    console.error('Organisation insert failed:', orgErr?.message);
    process.exit(1);
  }

  const orgId = orgRow.id;
  console.log('Created organisation:', orgName, `(${orgSlug})`, orgId);

  /** @type {Record<DeptKey, string>} */
  const deptIds = {};

  for (const d of DEPT_SPECS) {
    const { data: dept, error: dErr } = await supabase
      .from('departments')
      .insert({ org_id: orgId, name: d.name, type: d.type, is_archived: false })
      .select('id')
      .single();
    if (dErr || !dept) {
      console.error('Department insert failed:', d.name, dErr?.message);
      process.exit(1);
    }
    deptIds[d.key] = dept.id;
    console.log('  Department:', d.name, dept.id);
  }

  for (const person of rows) {
    const userId = await ensureAuthUser(supabase, person.email, person.password);

    const { error: profErr } = await supabase.from('profiles').upsert(
      {
        id: userId,
        org_id: orgId,
        full_name: person.fullName,
        email: person.email,
        role: person.role,
        status: 'active',
      },
      { onConflict: 'id' }
    );

    if (profErr) {
      console.error('profiles upsert failed:', person.email, profErr.message);
      process.exit(1);
    }

    const deptKeys = new Set([...person.memberOf, ...person.manages]);
    for (const k of deptKeys) {
      const did = deptIds[k];
      if (!did) continue;
      const { error: udErr } = await supabase.from('user_departments').upsert(
        { user_id: userId, dept_id: did },
        { onConflict: 'user_id,dept_id' }
      );
      if (udErr) {
        console.error('user_departments upsert failed:', person.email, udErr.message);
        process.exit(1);
      }
    }

    for (const k of person.manages) {
      const did = deptIds[k];
      if (!did) continue;
      const { error: dmErr } = await supabase.from('dept_managers').upsert(
        { user_id: userId, dept_id: did },
        { onConflict: 'user_id,dept_id' }
      );
      if (dmErr) {
        console.error('dept_managers upsert failed:', person.email, dmErr.message);
        process.exit(1);
      }
    }

    console.log('  User:', person.role, person.email);
  }

  console.log('\nDone. Log in at /login with any row above (same password for all unless you overrode CAMPSITE_DEMO_PASSWORD).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
