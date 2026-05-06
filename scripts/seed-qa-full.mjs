/**
 * Full QA organisation: Sussex SU–style departments and staff, deterministic emails, reporting, HR, draft broadcast.
 *
 * Prerequisites: migrations applied (`npm run supabase:db:push`), `.env` with:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (JWT role = service_role)
 *
 * Environment:
 *   CAMPSITE_QA_ORG_SLUG    default: campsite-qa-lab
 *   CAMPSITE_QA_ORG_NAME    default: CampSite QA Lab
 *   CAMPSITE_QA_PASSWORD    default: CampSiteQA2026!
 *
 * Usage:
 *   node scripts/seed-qa-full.mjs
 *
 * If the org slug already exists, delete the org in Supabase Dashboard (or use a new slug).
 */

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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

/** @typedef {'department' | 'society'} DeptType */

/** @type {{ key: string; name: string; type: DeptType }[]} */
const DEPT_SPECS = [
  { key: 'activities', name: 'Activities', type: 'department' },
  { key: 'student_voice', name: 'Student Voice', type: 'department' },
  { key: 'student_participation', name: 'Student Participation', type: 'department' },
  { key: 'events', name: 'Events', type: 'department' },
  { key: 'student_engagement', name: 'Student Engagement', type: 'department' },
  { key: 'comms_digital', name: 'Communications & Digital Support', type: 'department' },
  { key: 'commercial', name: 'Commercial', type: 'department' },
  { key: 'finance', name: 'Finance', type: 'department' },
  { key: 'hr', name: 'HR', type: 'department' },
  { key: 'senior_leadership', name: 'Senior Leadership', type: 'department' },
  { key: 'demo_society', name: 'Demo Society', type: 'society' },
];

/** Department “head” for reporting lines (reports to CEO except CEO). */
const DEPT_HEAD = {
  activities: 'jane_trueman',
  student_voice: 'joe_mcgarry',
  student_participation: 'kael_rigelsford',
  events: 'ruby_gislingham',
  student_engagement: 'kate_vessey',
  comms_digital: 'ciaran_clark',
  commercial: 'hannah_ward',
  finance: 'aarun_palmer',
  hr: 'olga_saskova',
  senior_leadership: 'james_hann',
};

/**
 * Job titles and dept assignments mirror a typical students’ union staff list (illustrative for QA).
 * @type {{ key: string; fullName: string; jobTitle: string; dept: string; role: string; isDeptManager?: boolean }[]}
 */
const STAFF = [
  {
    key: 'jane_trueman',
    fullName: 'Jane Trueman',
    jobTitle: 'Activities Manager',
    dept: 'activities',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'darcey_james',
    fullName: 'Darcey James',
    jobTitle: 'Sports Coordinator',
    dept: 'activities',
    role: 'coordinator',
  },
  {
    key: 'imogen_greene',
    fullName: 'Imogen Greene',
    jobTitle: 'Interim Activities Coordinator',
    dept: 'activities',
    role: 'coordinator',
  },
  {
    key: 'damien_pearson',
    fullName: 'Damien Pearson',
    jobTitle: 'Societies Admin',
    dept: 'activities',
    role: 'coordinator',
  },
  {
    key: 'matilda_torre',
    fullName: 'Matilda Torre',
    jobTitle: 'Societies Admin',
    dept: 'activities',
    role: 'coordinator',
  },
  {
    key: 'mysha_salman',
    fullName: 'Mysha Salman',
    jobTitle: 'Societies Admin',
    dept: 'activities',
    role: 'coordinator',
  },
  {
    key: 'joe_mcgarry',
    fullName: 'Joe McGarry',
    jobTitle: 'Student Voice Manager',
    dept: 'student_voice',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'kathy_oregan',
    fullName: "Kathy O'Regan",
    jobTitle: "Students' Union Advisor",
    dept: 'student_voice',
    role: 'coordinator',
  },
  {
    key: 'rob_luscombe',
    fullName: 'Rob Luscombe',
    jobTitle: "Students' Union Advisor",
    dept: 'student_voice',
    role: 'coordinator',
  },
  {
    key: 'holly_neal',
    fullName: 'Holly Neal',
    jobTitle: 'Student Voice Graduate',
    dept: 'student_voice',
    role: 'coordinator',
  },
  {
    key: 'radhika_thapliyal',
    fullName: 'Radhika Thapliyal',
    jobTitle: 'Returning Officer',
    dept: 'student_voice',
    role: 'coordinator',
  },
  {
    key: 'kael_rigelsford',
    fullName: 'Kael Rigelsford',
    jobTitle: 'Volunteer Projects Coordinator',
    dept: 'student_participation',
    role: 'coordinator',
  },
  {
    key: 'ruby_gislingham',
    fullName: 'Ruby Gislingham',
    jobTitle: 'Events Manager',
    dept: 'events',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'isla_thorpe',
    fullName: 'Isla Thorpe',
    jobTitle: 'Events Coordinator',
    dept: 'events',
    role: 'coordinator',
  },
  {
    key: 'yanna_erikson',
    fullName: 'Yanna Erikson',
    jobTitle: 'Events Administrator',
    dept: 'events',
    role: 'administrator',
  },
  {
    key: 'yoad_haran_diman',
    fullName: 'Yoad Haran-Diman',
    jobTitle: 'Events Administrator',
    dept: 'events',
    role: 'administrator',
  },
  {
    key: 'kate_vessey',
    fullName: 'Kate Vessey',
    jobTitle: 'Student Engagement Manager',
    dept: 'student_engagement',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'rafal_an',
    fullName: 'Rafal AN',
    jobTitle: 'Equity and Inclusion Coordinator',
    dept: 'student_engagement',
    role: 'coordinator',
  },
  {
    key: 'marcela_gomez_valdes',
    fullName: 'Marcela Gomez Valdes',
    jobTitle: 'Student Engagement Administrator',
    dept: 'student_engagement',
    role: 'administrator',
  },
  {
    key: 'phoebe_purver',
    fullName: 'Phoebe Purver',
    jobTitle: 'Campaigns Coordinator',
    dept: 'student_engagement',
    role: 'coordinator',
  },
  {
    key: 'raheel_aslam',
    fullName: 'Raheel Aslam',
    jobTitle: 'International Student Support Administrator',
    dept: 'student_engagement',
    role: 'administrator',
  },
  {
    key: 'zaryab_pervez',
    fullName: 'Zaryab Pervez',
    jobTitle: 'Business School Race Equity Advocate',
    dept: 'student_engagement',
    role: 'coordinator',
  },
  {
    key: 'ciaran_clark',
    fullName: 'Ciarán Clark',
    jobTitle: 'Communications & Digital Support Manager',
    dept: 'comms_digital',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'ali_arief',
    fullName: 'Ali Arief',
    jobTitle: 'Communications Coordinator',
    dept: 'comms_digital',
    role: 'coordinator',
  },
  {
    key: 'katie_vicary',
    fullName: 'Katie Vicary',
    jobTitle: 'Graphic Designer',
    dept: 'comms_digital',
    role: 'coordinator',
  },
  {
    key: 'hestin_klaas',
    fullName: 'Hestin Klaas',
    jobTitle: 'Communications & Digital Support Administrator',
    dept: 'comms_digital',
    role: 'administrator',
  },
  {
    key: 'timothy_bartlett',
    fullName: 'Timothy Bartlett',
    jobTitle: 'Digital Support Assistant',
    dept: 'comms_digital',
    role: 'csa',
  },
  {
    key: 'hannah_ward',
    fullName: 'Hannah Ward',
    jobTitle: 'Retail Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'jamie_bond',
    fullName: 'Jamie Bond',
    jobTitle: 'Venues Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'poppy_wootton',
    fullName: 'Poppy Wootton',
    jobTitle: 'Commercial Marketing Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'anthony_gorin',
    fullName: 'Anthony Gorin',
    jobTitle: 'Deputy Retail Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'irma_romei',
    fullName: 'Irma Romei',
    jobTitle: 'Shop Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'sophie_morland',
    fullName: 'Sophie Morland',
    jobTitle: 'Bar Manager',
    dept: 'commercial',
    role: 'duty_manager',
    isDeptManager: true,
  },
  {
    key: 'tracey_dempster',
    fullName: 'Tracey Dempster',
    jobTitle: 'Deputy Retail Manager',
    dept: 'commercial',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'tyler_cohen',
    fullName: 'Tyler Cohen',
    jobTitle: 'Entertainment and Hospitality Coordinator',
    dept: 'commercial',
    role: 'coordinator',
  },
  {
    key: 'aarun_palmer',
    fullName: 'Aarun Palmer',
    jobTitle: 'Finance Manager',
    dept: 'finance',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'mary_morrison',
    fullName: 'Mary Morrison',
    jobTitle: 'Interim Finance Supervisor',
    dept: 'finance',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'kirsty_burnett',
    fullName: 'Kirsty Burnett',
    jobTitle: 'Senior Finance Assistant',
    dept: 'finance',
    role: 'coordinator',
  },
  {
    key: 'michelle_heath',
    fullName: 'Michelle Heath',
    jobTitle: 'Senior Finance Assistant',
    dept: 'finance',
    role: 'coordinator',
  },
  {
    key: 'amalia_tarabuta',
    fullName: 'Amalia Tarabuta',
    jobTitle: 'Finance Administrator',
    dept: 'finance',
    role: 'administrator',
  },
  {
    key: 'olga_saskova',
    fullName: 'Olga Saskova',
    jobTitle: 'HR Manager',
    dept: 'hr',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'sarthak_peshin',
    fullName: 'Sarthak Peshin',
    jobTitle: 'HR Coordinator',
    dept: 'hr',
    role: 'coordinator',
  },
  {
    key: 'james_hann',
    fullName: 'James Hann',
    jobTitle: 'CEO',
    // Org chart lanes use department name from user_departments; CEO / Deputy / this role all use senior_leadership -> "Senior Leadership".
    dept: 'senior_leadership',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'tarek_khalil',
    fullName: 'Tarek Khalil',
    jobTitle: 'Deputy CEO',
    dept: 'senior_leadership',
    role: 'manager',
    isDeptManager: true,
  },
  {
    key: 'rachael_wall',
    fullName: 'Rachael Wall',
    jobTitle: 'Interim Head of Student Representation',
    dept: 'senior_leadership',
    role: 'manager',
    isDeptManager: true,
  },
];

/** Extra QA fixtures (approval flow, society, full admin). */
const FIXTURE_USERS = [
  {
    key: 'orgadmin',
    fullName: 'QA Org Admin',
    jobTitle: 'Platform QA  org admin',
    role: 'org_admin',
    status: 'active',
    dept: 'senior_leadership',
    memberOf: ['senior_leadership'],
    manages: [],
    isDeptManager: false,
    reportsToKey: null,
  },
  {
    key: 'pending',
    fullName: 'QA Pending Applicant',
    jobTitle: 'Applicant',
    role: 'unassigned',
    status: 'pending',
    dept: 'activities',
    memberOf: ['activities'],
    manages: [],
    reportsToKey: null,
  },
  {
    key: 'society_lead',
    fullName: 'QA Society Leader',
    jobTitle: 'Society president (demo)',
    role: 'society_leader',
    status: 'active',
    dept: 'demo_society',
    memberOf: ['demo_society'],
    manages: [],
    reportsToKey: null,
  },
];

function emailFor(personaKey) {
  const slug = personaKey.replace(/_/g, '-');
  return `campsite-qa-${slug}@example.com`;
}

/**
 * @param {{ key: string; dept: string }} p
 * @param {Record<string, string>} headByDept
 */
function reportsToKeyFor(p, headByDept) {
  if (p.key === 'james_hann') return null;
  if (['tarek_khalil', 'rachael_wall'].includes(p.key)) return 'james_hann';
  const head = headByDept[p.dept];
  if (head === p.key) return 'james_hann';
  return head;
}

async function main() {
  const orgSlug = process.env.CAMPSITE_QA_ORG_SLUG?.trim() || 'campsite-qa-lab';
  const orgName = process.env.CAMPSITE_QA_ORG_NAME?.trim() || 'CampSite QA Lab';
  const password = process.env.CAMPSITE_QA_PASSWORD?.trim() || 'CampSiteQA2026!';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  if (jwtRole(serviceKey) !== 'service_role') {
    console.error('SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existingOrg } = await supabase.from('organisations').select('id').eq('slug', orgSlug).maybeSingle();
  if (existingOrg) {
    console.error(
      `Organisation slug already exists: ${orgSlug}\n` +
        'Delete it in Supabase (or set CAMPSITE_QA_ORG_SLUG). See docs/QA_SEED_AND_SCENARIOS.md',
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
  console.log('Organisation:', orgName, orgSlug, orgId);

  /** @type {Record<string, string>} */
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
    console.log('  Department', d.name, dept.id);
  }

  const headByDept = { ...DEPT_HEAD };

  /** @type {typeof STAFF[number] & { status?: string; memberOf?: string[]; manages?: string[]; reportsToKey?: string|null }}[]} */
  const allPeople = [
    ...STAFF.map((s) => ({
      ...s,
      status: 'active',
      memberOf: [s.dept],
      manages: [],
    })),
    ...FIXTURE_USERS,
  ];

  /** @type {Record<string, string>} */
  const userIdByKey = {};
  /** @type {{ key: string; email: string; fullName: string; role: string; status: string }[]} */
  const credentials = [];

  for (const p of allPeople) {
    const email = emailFor(p.key);
    const userId = await ensureAuthUser(supabase, email, password);

    const { error: profErr } = await supabase.from('profiles').upsert(
      {
        id: userId,
        org_id: orgId,
        full_name: p.fullName,
        email,
        role: p.role,
        status: p.status ?? 'active',
      },
      { onConflict: 'id' },
    );

    if (profErr) {
      console.error('profiles upsert failed:', email, profErr.message);
      process.exit(1);
    }

    userIdByKey[p.key] = userId;
    credentials.push({
      key: p.key,
      email,
      fullName: p.fullName,
      role: p.role,
      status: p.status ?? 'active',
    });

    const manages = 'manages' in p && Array.isArray(p.manages) ? p.manages : [];
    const memberOf = 'memberOf' in p && Array.isArray(p.memberOf) ? p.memberOf : [p.dept];
    const deptKeys = new Set([...memberOf, ...manages]);
    for (const k of deptKeys) {
      const did = deptIds[k];
      if (!did) continue;
      const { error: udErr } = await supabase.from('user_departments').upsert(
        { user_id: userId, dept_id: did },
        { onConflict: 'user_id,dept_id' },
      );
      if (udErr) {
        console.error('user_departments failed:', email, udErr.message);
        process.exit(1);
      }
    }

    const isMgr = 'isDeptManager' in p && p.isDeptManager;
    if (isMgr) {
      const dk = 'dept' in p ? p.dept : memberOf[0];
      const did = deptIds[dk];
      if (did) {
        const { error: dmErr } = await supabase.from('dept_managers').upsert(
          { user_id: userId, dept_id: did },
          { onConflict: 'user_id,dept_id' },
        );
        if (dmErr) {
          console.error('dept_managers failed:', email, dmErr.message);
          process.exit(1);
        }
      }
    }

    console.log('  User', p.status ?? 'active', p.role, email);
  }

  const orgAdminId = userIdByKey.orgadmin;
  const janeId = userIdByKey.jane_trueman;
  const darceyId = userIdByKey.darcey_james;

  for (const p of allPeople) {
    let resolved = null;
    if (['orgadmin', 'pending', 'society_lead'].includes(p.key)) {
      resolved = 'reportsToKey' in p ? p.reportsToKey ?? null : null;
    } else if ('dept' in p && p.dept) {
      resolved = reportsToKeyFor({ key: p.key, dept: p.dept }, headByDept);
    }
    if (!resolved) continue;
    const targetId = userIdByKey[p.key];
    const mgrId = userIdByKey[resolved];
    if (!targetId || !mgrId) continue;
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ reports_to_user_id: mgrId })
      .eq('id', targetId)
      .eq('org_id', orgId);
    if (upErr) {
      console.error('reports_to update failed:', p.key, upErr.message);
      process.exit(1);
    }
  }

  const { data: teamRow, error: teamErr } = await supabase
    .from('department_teams')
    .insert({
      dept_id: deptIds.activities,
      name: 'Staff Team',
      lead_user_id: janeId,
    })
    .select('id')
    .single();

  if (teamErr || !teamRow) {
    console.error('department_teams insert:', teamErr?.message);
    process.exit(1);
  }

  for (const uid of [janeId, darceyId, userIdByKey.imogen_greene]) {
    const { error: memErr } = await supabase.from('department_team_members').upsert(
      { team_id: teamRow.id, user_id: uid },
      { onConflict: 'user_id,team_id' },
    );
    if (memErr) {
      console.error('department_team_members:', memErr.message);
      process.exit(1);
    }
  }
  console.log('  Team Staff Team (Activities)', teamRow.id);

  for (const p of allPeople) {
    if ((p.status ?? 'active') !== 'active') continue;
    if (!('jobTitle' in p) || !p.jobTitle) continue;
    const uid = userIdByKey[p.key];
    if (!uid) continue;
    const { error: hrErr } = await supabase.from('employee_hr_records').upsert(
      {
        org_id: orgId,
        user_id: uid,
        job_title: p.jobTitle,
        grade_level: 'L2',
        contract_type: 'full_time',
        salary_band: 'Band A',
        fte: 1,
        work_location: 'hybrid',
        employment_start_date: '2025-01-15',
        created_by: orgAdminId,
      },
      { onConflict: 'org_id,user_id' },
    );
    if (hrErr) {
      console.error('employee_hr_records:', p.key, hrErr.message);
      process.exit(1);
    }
  }
  console.log('  HR records: job titles for all active seeded users');

  const { data: chan, error: chErr } = await supabase
    .from('broadcast_channels')
    .insert({ dept_id: deptIds.activities, name: 'Announcements' })
    .select('id')
    .single();

  if (chErr || !chan) {
    console.error('broadcast_channels:', chErr?.message);
    process.exit(1);
  }

  const { error: bcErr } = await supabase.from('broadcasts').insert({
    org_id: orgId,
    dept_id: deptIds.activities,
    channel_id: chan.id,
    title: '[QA] Draft broadcast  approvals',
    body: 'Seed content for testing draft → pending approval → send workflow.',
    status: 'draft',
    created_by: janeId,
  });

  if (bcErr) {
    console.error('broadcasts:', bcErr.message);
    process.exit(1);
  }
  console.log('  Draft broadcast in Activities / Announcements');

  const fixturesPath = join(root, 'apps/web/src/lib/reports/fixtures/report-seed-fixtures.json');
  if (!existsSync(fixturesPath)) {
    console.error('Missing report seed fixtures:', fixturesPath);
    process.exit(1);
  }
  const { reports: reportSeedTemplates } = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  for (const r of reportSeedTemplates) {
    const { error: repErr } = await supabase.from('reports').insert({
      id: r.id,
      org_id: orgId,
      created_by: orgAdminId,
      updated_by: orgAdminId,
      name: r.name,
      description: r.description,
      domains: r.domains,
      config: r.config,
      tags: r.tags,
      visibility: r.visibility,
      shared_role_keys: [],
    });
    if (repErr) {
      console.error('reports seed:', r.name, repErr.message);
      process.exit(1);
    }
  }
  console.log(`  Saved sample reports (${reportSeedTemplates.length}) for /reports  Run / export`);

  const manifest = {
    generatedAt: new Date().toISOString(),
    org: { id: orgId, slug: orgSlug, name: orgName },
    password,
    departments: deptIds,
    userIds: userIdByKey,
    logins: credentials.map((c) => ({ ...c, password })),
  };

  const outPath = join(root, 'scripts', 'qa-seed-output.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\nDone. Password for all QA users:', password);
  console.log('Wrote', outPath);
  console.log('Read docs/QA_SEED_AND_SCENARIOS.md for the full manual test matrix.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
