/**
 * Provision "University of Sussex Student Union" (USSU) from the HR staff workbook.
 *
 * Prerequisites:
 *   - Python 3 + openpyxl (`pip3 install openpyxl`)
 *   - Repo root `.env`: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * Required:
 *   - CAMPSITE_USSU_PASSWORD  — shared initial password for all seeded auth users (set in env; never commit)
 *
 * Optional:
 *   - CAMPSITE_USSU_XLSX       — path to workbook (defaults to the repo copy with the long filename)
 *   - CAMPSITE_USSU_ORG_SLUG   — default: university-of-sussex-student-union
 *   - CAMPSITE_USSU_ORG_NAME   — default: University of Sussex Student Union
 *   - PYTHON                   — default: python3
 *   - --plan                   — parse + print role mix only (no Supabase)
 *   - --continue               — use existing org with same CAMPSITE_USSU_ORG_SLUG (re-run safe)
 *   - CAMPSITE_USSU_SKIP_EMPLOYEE_HR=1 — skip HR table (users/depts/managers still run)
 *
 * Outputs (gitignored):
 *   - scripts/ussu-provision-output/logins-<timestamp>.csv
 *   - scripts/ussu-provision-output/ussu-password-import.csv — Chrome Password Manager export shape
 *     (header: name,url,username,password,note — same as Chrome Passwords.csv)
 *
 * Usage:
 *   CAMPSITE_USSU_PASSWORD='…' node scripts/provision-university-of-sussex-student-union.mjs
 *   node scripts/provision-university-of-sussex-student-union.mjs --plan
 */

import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** Google Chrome “Passwords.csv” export / import format (comma-separated, RFC-style quoting). */
function escapeCsvField(value) {
  const t = String(value ?? '');
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** @param {string[]} cols */
function chromePasswordsCsvRow(cols) {
  return cols.map(escapeCsvField).join(',');
}

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

/** @param {string} jobTitle */
function inferRole(jobTitle) {
  const t = (jobTitle || '').toLowerCase();
  if (!t) return 'administrator';
  if (t === 'ceo' || (t.includes('chief executive') && !t.includes('deputy'))) return 'org_admin';
  if (t.includes('deputy chief executive')) return 'org_admin';
  if (t.includes('duty manager')) return 'duty_manager';
  if (t.includes('coordinator')) return 'coordinator';
  if (
    t.includes('administrator') ||
    t.includes('assistant') ||
    t.includes(' admin') ||
    t.includes('adviser') ||
    t.includes('advisor') ||
    t.includes('designer') ||
    t.includes('creator')
  ) {
    return 'administrator';
  }
  if (t.includes('officer') && !t.includes('coordinator')) return 'society_leader';
  if (
    t.includes('manager') ||
    t.includes('head of') ||
    t.includes('supervisor') ||
    t.includes('returning officer')
  ) {
    return 'manager';
  }
  if (t.includes('advocate') || t.includes('events crew')) return 'csa';
  if (t.includes('leader') && !t.includes('manager')) return 'coordinator';
  return 'administrator';
}

/** @param {string} text */
function parseWeeklyHours(text) {
  if (!text) return null;
  const range = text.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)?/i);
  if (m) return parseFloat(m[1]);
  const ann = text.match(/annualised\s+hours\s+of\s+(\d+)/i);
  if (ann) return parseFloat(ann[1]) / 52;
  return null;
}

/**
 * @param {string} contractRaw
 * @param {string} hoursText
 * @param {number | null} weeklyHours
 */
function inferContractType(contractRaw, hoursText, weeklyHours) {
  const c = (contractRaw || '').toLowerCase();
  const h = hoursText.toLowerCase();
  if (h.includes('zero') && h.includes('hour')) return 'zero_hours';
  if (weeklyHours != null && weeklyHours < 22) return 'part_time';
  if (h.includes('part time') || h.includes('part-time')) return 'part_time';
  if (c.includes('fixed') || c.includes('permanent')) {
    if (weeklyHours != null && weeklyHours < 30) return 'part_time';
    return 'full_time';
  }
  return 'full_time';
}

/** @param {string} contractType */
function inferFte(contractType, weeklyHours) {
  if (contractType === 'zero_hours') return 0.25;
  if (contractType === 'part_time' && weeklyHours != null && weeklyHours > 0) {
    const f = Math.round((weeklyHours / 37.5) * 100) / 100;
    return Math.min(1, Math.max(0.1, f));
  }
  if (contractType === 'part_time') return 0.6;
  return 1;
}

/** @param {string} s */
function foldName(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  /** @type {number[][]} */
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
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

/**
 * @param {string} fullName
 * @param {Map<string, number>} usedLocal
 */
function allocateEmail(fullName, usedLocal) {
  const parts = fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const rawFirst = (parts[0] || 'user').replace(/[^a-z\-]/g, '');
  const rawLast = (parts[parts.length - 1] || 'user').replace(/[^a-z\-]/g, '');
  const base = `${rawFirst}.${rawLast}`.replace(/^\.|\.$/g, '') || 'user.user';
  const n = usedLocal.get(base) ?? 0;
  usedLocal.set(base, n + 1);
  const suffix = n === 0 ? '' : String(n + 1);
  return `${base}${suffix}@camp-site.co.uk`;
}

function defaultXlsxPath() {
  const name = "HR Copy of Staff List (excluding trading CSA's & DM's) copy.xlsx";
  return join(root, name);
}

async function main() {
  const planOnly = process.argv.includes('--plan');
  const xlsxPath = process.env.CAMPSITE_USSU_XLSX?.trim() || defaultXlsxPath();
  const orgSlug =
    process.env.CAMPSITE_USSU_ORG_SLUG?.trim() || 'university-of-sussex-student-union';
  const orgName =
    process.env.CAMPSITE_USSU_ORG_NAME?.trim() || 'University of Sussex Student Union';
  const password = process.env.CAMPSITE_USSU_PASSWORD?.trim();

  if (!existsSync(xlsxPath)) {
    console.error(
      `Workbook not found: ${xlsxPath}\nSet CAMPSITE_USSU_XLSX to the absolute path of the staff list.`
    );
    process.exit(1);
  }

  const py = process.env.PYTHON?.trim() || 'python3';
  const parser = join(__dirname, 'parse-ussu-staff-xlsx.py');
  const res = spawnSync(py, [parser, xlsxPath], { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error) {
    console.error('Failed to run Python parser:', res.error.message);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status ?? 1);
  }

  /** @type {Array<Record<string, unknown>>} */
  const rows = JSON.parse(res.stdout);

  const usedLocal = new Map();
  const people = rows.map((r) => {
    const fullName = String(r.full_name);
    const jobTitle = String(r.job_title || '');
    const role = inferRole(jobTitle);
    const deptName = (r.structural_dept && String(r.structural_dept).trim()) || 'General';
    const email = allocateEmail(fullName, usedLocal);
    const weeklyHours = parseWeeklyHours(String(r.hours_text || ''));
    const contractType = inferContractType(
      String(r.contract_type_raw || ''),
      String(r.hours_text || ''),
      weeklyHours
    );
    const fte = inferFte(contractType, weeklyHours);
    return {
      ...r,
      full_name: fullName,
      job_title: jobTitle,
      role,
      department_name: deptName,
      email,
      weekly_hours: weeklyHours,
      contract_type_app: contractType,
      fte,
    };
  });

  people.sort((a, b) => (a.sheet_row ?? 0) - (b.sheet_row ?? 0));

  const mix = people.reduce((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});
  console.log(`Parsed ${people.length} staff rows from ${xlsxPath}`);
  console.log('Role mix:', mix);
  console.log('Departments:', [...new Set(people.map((p) => p.department_name))].sort().join(', '));

  if (planOnly) {
    console.log('\n(--plan: no Supabase calls)\n');
    return;
  }

  if (!password) {
    console.error(
      'Set CAMPSITE_USSU_PASSWORD in the environment (shared initial password for all seeded users).\n' +
        'Do not commit passwords to the repo.'
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (jwtRole(serviceKey) !== 'service_role') {
    console.error('SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const continueRun =
    process.argv.includes('--continue') || process.env.CAMPSITE_USSU_CONTINUE === '1';
  const skipEmployeeHr = process.env.CAMPSITE_USSU_SKIP_EMPLOYEE_HR === '1';

  const { data: existingOrg, error: exOrgErr } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .maybeSingle();

  if (exOrgErr) {
    console.error('organisations lookup failed:', exOrgErr.message);
    process.exit(1);
  }
  if (existingOrg && !continueRun) {
    console.error(
      `Organisation slug already exists: ${orgSlug}\n` +
        'Re-run with --continue to sync users/HR against that org, or delete it / change CAMPSITE_USSU_ORG_SLUG.'
    );
    process.exit(1);
  }

  /** @type {string} */
  let orgId;

  if (existingOrg && continueRun) {
    orgId = existingOrg.id;
    console.log('\nContinuing organisation:', orgName, orgSlug, orgId);
  } else {
    const { data: orgRow, error: orgErr } = await supabase
      .from('organisations')
      .insert({ name: orgName, slug: orgSlug, is_active: true })
      .select('id')
      .single();

    if (orgErr || !orgRow) {
      console.error('Organisation insert failed:', orgErr?.message);
      process.exit(1);
    }
    orgId = orgRow.id;
    console.log('\nCreated organisation:', orgName, orgId);
  }

  const deptNames = [...new Set(people.map((p) => p.department_name))].sort();
  /** @type {Record<string, string>} */
  const deptIdByName = {};

  for (const name of deptNames) {
    const { data: existingDept, error: lookErr } = await supabase
      .from('departments')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', name)
      .maybeSingle();
    if (lookErr) {
      console.error('Department lookup failed:', name, lookErr.message);
      process.exit(1);
    }
    if (existingDept?.id) {
      deptIdByName[name] = existingDept.id;
      continue;
    }
    const { data: dept, error: dErr } = await supabase
      .from('departments')
      .insert({ org_id: orgId, name, type: 'department', is_archived: false })
      .select('id')
      .single();
    if (dErr || !dept) {
      console.error('Department insert failed:', name, dErr?.message);
      process.exit(1);
    }
    deptIdByName[name] = dept.id;
    console.log('  Department:', name, dept.id);
  }

  /** @type {Array<{ person: (typeof people)[0]; userId: string }>} */
  const provisioned = [];

  for (const person of people) {
    const userId = await ensureAuthUser(supabase, person.email, password);
    const deptId = deptIdByName[person.department_name];
    if (!deptId) {
      console.error('Missing department id for', person.department_name);
      process.exit(1);
    }

    const { error: profErr } = await supabase.from('profiles').upsert(
      {
        id: userId,
        org_id: orgId,
        full_name: person.full_name,
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

    const { error: udErr } = await supabase.from('user_departments').upsert(
      { user_id: userId, dept_id: deptId },
      { onConflict: 'user_id,dept_id' }
    );
    if (udErr) {
      console.error('user_departments failed:', person.email, udErr.message);
      process.exit(1);
    }

    provisioned.push({ person, userId });
    console.log('  User:', person.role, person.email, '—', person.full_name);
  }

  const idByFold = new Map();
  for (const { person, userId } of provisioned) {
    idByFold.set(foldName(person.full_name), userId);
  }

  /** @param {string} managerText */
  function resolveManagerUserId(managerText) {
    const raw = (managerText || '').trim();
    if (!raw) return null;
    const f = foldName(raw);
    if (!f || f.includes('trustee')) return null;
    if (idByFold.has(f)) return idByFold.get(f) ?? null;
    let bestId = null;
    let best = 999;
    for (const { person, userId } of provisioned) {
      const d = levenshtein(f, foldName(person.full_name));
      if (d < best) {
        best = d;
        bestId = userId;
      }
    }
    if (best <= 4) return bestId;
    return null;
  }

  const emailByUserId = new Map(provisioned.map(({ person, userId }) => [userId, person.email]));

  /** @type {Map<string, string>} */
  const reportsToEmailByUserId = new Map();

  for (const { person, userId } of provisioned) {
    const mgrId = resolveManagerUserId(String(person.manager_text || ''));
    if (mgrId) {
      reportsToEmailByUserId.set(userId, emailByUserId.get(mgrId) || '');
    }
    if (!mgrId) continue;
    const { error: upErr } = await supabase
      .from('profiles')
      .update({ reports_to_user_id: mgrId })
      .eq('id', userId)
      .eq('org_id', orgId);
    if (upErr) {
      console.error('reports_to update failed:', person.full_name, upErr.message);
      process.exit(1);
    }
  }

  const ceo =
    provisioned.find((x) => x.person.role === 'org_admin' && /ceo/i.test(x.person.job_title)) ||
    provisioned.find((x) => x.person.role === 'org_admin');
  if (!ceo) {
    console.error('No org_admin found to use as HR record created_by.');
    process.exit(1);
  }
  const createdBy = ceo.userId;

  if (!skipEmployeeHr) {
    /** @type {string | null} */
    let hrExtendedMode = 'full';

    for (const { person, userId } of provisioned) {
      const payGrade =
        [person.grade, person.point].filter(Boolean).join('/') || String(person.grade || '');

      const roleStart = person.role_start ? String(person.role_start).slice(0, 10) : null;
      const contEmp = person.continuous_employment
        ? String(person.continuous_employment).slice(0, 10)
        : null;
      const employmentStart = contEmp || roleStart;

      /** @type {Record<string, string>} */
      const customFields = {
        spreadsheet_section: person.structural_dept ? String(person.structural_dept) : '',
        manager_raw: person.manager_text ? String(person.manager_text) : '',
        hours_raw: person.hours_text ? String(person.hours_text) : '',
        sheet_row: String(person.sheet_row ?? ''),
      };

      const notesMerged = [
        person.profile_note ? String(person.profile_note) : '',
        person.hours_text ? `Hours: ${person.hours_text}` : '',
        person.employed_by ? `Employer: ${person.employed_by}` : '',
        person.contract_type_raw ? `Contract: ${person.contract_type_raw}` : '',
        payGrade ? `Pay grade/point: ${payGrade}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const recordFull = {
        org_id: orgId,
        user_id: userId,
        job_title: person.job_title || '',
        grade_level: String(person.grade ?? ''),
        contract_type: person.contract_type_app,
        salary_band: String(person.budget_code ?? ''),
        fte: person.fte,
        work_location: 'office',
        employment_start_date: employmentStart,
        probation_end_date: null,
        notice_period_weeks: null,
        hired_from_application_id: null,
        notes: notesMerged || null,
        created_by: createdBy,
        updated_by: createdBy,
        position_type: person.employed_by ? String(person.employed_by) : '',
        pay_grade: payGrade,
        employment_basis: person.contract_type_raw ? String(person.contract_type_raw) : '',
        weekly_hours: person.weekly_hours,
        positions_count: 1,
        budget_amount: null,
        budget_currency: '',
        department_start_date: roleStart,
        continuous_employment_start_date: contEmp,
        custom_fields: customFields,
      };

      const recordBase = {
        org_id: orgId,
        user_id: userId,
        job_title: person.job_title || '',
        grade_level: String(person.grade ?? ''),
        contract_type: person.contract_type_app,
        salary_band: String(person.budget_code ?? ''),
        fte: person.fte,
        work_location: 'office',
        employment_start_date: employmentStart,
        probation_end_date: null,
        notice_period_weeks: null,
        hired_from_application_id: null,
        notes: notesMerged || null,
        created_by: createdBy,
        updated_by: createdBy,
      };

      const payload = hrExtendedMode === 'full' ? recordFull : recordBase;
      const { error: hrErr } = await supabase.from('employee_hr_records').upsert(payload, {
        onConflict: 'org_id,user_id',
      });

      if (hrErr) {
        const msg = hrErr.message || '';
        const looksLikeMissingExt =
          /column|schema cache|Could not find/i.test(msg) && hrExtendedMode === 'full';
        if (looksLikeMissingExt) {
          console.warn(
            'employee_hr_records: extended columns not available; retrying with core columns only.\n' +
              'Apply supabase/migrations/20260618220000_employee_hr_extended_workforce_fields.sql when ready.'
          );
          hrExtendedMode = 'base';
          const { error: e2 } = await supabase.from('employee_hr_records').upsert(recordBase, {
            onConflict: 'org_id,user_id',
          });
          if (e2) {
            console.error('employee_hr_records upsert failed:', person.email, e2.message);
            process.exit(1);
          }
        } else {
          console.error(
            'employee_hr_records upsert failed:',
            person.email,
            hrErr.message,
            '\n→ Or set CAMPSITE_USSU_SKIP_EMPLOYEE_HR=1 to skip HR rows.'
          );
          process.exit(1);
        }
      }
    }
  } else {
    console.warn('Skipping employee_hr_records (CAMPSITE_USSU_SKIP_EMPLOYEE_HR=1).');
  }

  for (const { person, userId } of provisioned) {
    if (!['org_admin', 'manager', 'duty_manager'].includes(person.role)) continue;
    const deptId = deptIdByName[person.department_name];
    const { error: dmErr } = await supabase.from('dept_managers').upsert(
      { user_id: userId, dept_id: deptId },
      { onConflict: 'user_id,dept_id' }
    );
    if (dmErr) {
      console.error('dept_managers upsert failed:', person.email, dmErr.message);
      process.exit(1);
    }
  }

  const outDir = join(__dirname, 'ussu-provision-output');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = join(outDir, `logins-${stamp}.csv`);

  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    ['full_name', 'email', 'password', 'role', 'department', 'job_title', 'reports_to_email'].join(
      ','
    ),
  ];
  for (const { person, userId } of provisioned) {
    const reportsEmail = reportsToEmailByUserId.get(userId) || '';
    lines.push(
      [
        esc(person.full_name),
        esc(person.email),
        esc(password),
        esc(person.role),
        esc(person.department_name),
        esc(person.job_title),
        esc(reportsEmail),
      ].join(',')
    );
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf8');

  const chromeSiteName = 'camp-site.co.uk';
  const chromeLoginUrl = 'https://camp-site.co.uk/login';
  const chromeNote =
    'University of Sussex Student Union (USSU) seed; shared password for all rows unless you changed CAMPSITE_USSU_PASSWORD when seeding.';
  const passwordImportPath = join(outDir, 'ussu-password-import.csv');
  const passwordImportLines = [
    chromePasswordsCsvRow(['name', 'url', 'username', 'password', 'note']),
    ...provisioned.map(({ person }) =>
      chromePasswordsCsvRow([chromeSiteName, chromeLoginUrl, person.email, password, chromeNote])
    ),
  ];
  writeFileSync(passwordImportPath, `${passwordImportLines.join('\n')}\n`, 'utf8');

  console.log(`\nDone. Login CSV: ${csvPath}`);
  console.log(`Chrome Passwords import (name,url,username,password,note): ${passwordImportPath}`);
  console.log('Use /login with any email row and the password from CAMPSITE_USSU_PASSWORD.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
