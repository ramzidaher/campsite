#!/usr/bin/env node
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const ORG_NAME =
  process.env.CAMPSITE_SYSTEM_QA_ORG_NAME || "CampSite System QA Lab";
const ORG_SLUG =
  process.env.CAMPSITE_SYSTEM_QA_ORG_SLUG || "campsite-system-qa-lab";
const DEFAULT_PASSWORD =
  process.env.CAMPSITE_SYSTEM_QA_PASSWORD ||
  process.env.CAMPSITE_USSU_PASSWORD ||
  process.env.CAMPSITE_QA_PASSWORD ||
  "CampSiteQA2026!";
const RESET_EXISTING_PASSWORDS =
  process.env.CAMPSITE_SYSTEM_QA_RESET_PASSWORDS === "1";
const ACTIVATE_PROFILES =
  process.env.CAMPSITE_SYSTEM_QA_ACTIVATE_PROFILES !== "0";

const args = new Set(process.argv.slice(2));
const PLAN_ONLY = args.has("--plan");
const CONTINUE = args.has("--continue");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const featurePlan = [
  "Org shell: multi-org membership, active org switching target, roles, departments, teams, manager assignments, profile states, and shell preferences.",
  "Broadcasts: org-wide, department, team targeted, mandatory, pinned, draft, pending approval, scheduled, cancelled, sent, read, unread, replies, subscriptions, finance/comms/student-voice channels, and performance-adjacent HR posts.",
  "Notifications: read and unread notification rows across broadcast, leave, hiring, and application workflows where schemas are present.",
  "Calendar and rota-adjacent states: manual, rota, and broadcast events with attendee response states.",
  "Attendance and payroll: work sites, clock-in/out events, submitted/approved/rejected/draft timesheets, wagesheet lines, adjustments, and review rows where available.",
  "Leave and absence: allowances, pending, approved, rejected, cancelled leave, sickness episodes, TOIL credit requests, in-app leave notifications, and org leave-year settings.",
  "HR records: employee records (contract, RTW, address, emergency contacts), payroll pay profiles and role rates, bank/tax/P60 documents, custom document categories, training, medical notes, dependants, employment history, disciplinary/grievance cases, leave encashment/carry-over requests, and custom fields.",
  "Hiring: recruitment requests (incl. filled/archived + status audit), job listings, panelists, application question sets, screening Q&A and scores, applications across the pipeline, interviews, notes, messages, offers, contract assignments, start readiness, and portal tokens.",
  "Onboarding: templates, template tasks, runs for pending + active staff + completed + cancelled paths, and per-run tasks (HR logins use CHRO / HR officer roles so admin onboarding RLS is satisfied).",
  "Performance: review cycles, reviews, goals, and multiple completion states (incl. closed-cycle history); primary HR persona can manage cycles and view org reports.",
  "One-on-ones: org cadence settings, templates (agenda → structured doc), scheduled/in-progress/completed/cancelled meetings with doc payloads, and note edit requests.",
  "Resources and reports: folders, active/archived resources, report definitions, runs, schedules, exports, and pinned reports.",
  "Privacy and admin ops: retention policies, erasure requests, audit entries, discount tiers, QR tokens, scan logs, and integration placeholders where available.",
];

const personas = [
  {
    key: "james_hann",
    fullName: "James Hann",
    email: "james.hann@camp-site.co.uk",
    role: "org_admin",
    status: "active",
    department: "Senior Leadership",
    title: "Chief Executive Officer",
  },
  {
    key: "tarek_khalil",
    fullName: "Tarek Khalil",
    email: "tarek.khalil@camp-site.co.uk",
    role: "org_admin",
    status: "active",
    department: "Senior Leadership",
    title: "Deputy Chief Executive Officer",
  },
  {
    key: "olga_saskova",
    fullName: "Olga Saskova",
    email: "olga.saskova@camp-site.co.uk",
    // CHRO-shaped role so QA can open HR onboarding + performance admin (generic manager lacks those grants).
    role: "chro_hr_director",
    status: "active",
    department: "HR",
    title: "HR Manager",
  },
  {
    key: "sarthak_peshin",
    fullName: "Sarthak Peshin",
    email: "sarthak.peshin@camp-site.co.uk",
    // HR officer: run onboarding + view records without full cycle-admin surface.
    role: "hr_officer",
    status: "active",
    department: "HR",
    title: "HR Coordinator",
  },
  {
    key: "aarun_palmer",
    fullName: "Aarun Palmer",
    email: "aarun.palmer@camp-site.co.uk",
    role: "manager",
    status: "active",
    department: "Finance",
    title: "Finance Manager",
  },
  {
    key: "jane_trueman",
    fullName: "Jane Trueman",
    email: "jane.trueman@camp-site.co.uk",
    role: "manager",
    status: "active",
    department: "Activities",
    title: "Activities Manager",
  },
  {
    key: "darcey_james",
    fullName: "Darcey James",
    email: "darcey.james@camp-site.co.uk",
    role: "coordinator",
    status: "active",
    department: "Activities",
    title: "Sports Coordinator",
  },
  {
    key: "imogen_greene",
    fullName: "Imogen Greene",
    email: "imogen.greene@camp-site.co.uk",
    role: "coordinator",
    status: "active",
    department: "Activities",
    title: "Interim Activities Coordinator",
  },
  {
    key: "damien_pearson",
    fullName: "Damien Pearson",
    email: "damien.pearson@camp-site.co.uk",
    role: "administrator",
    status: "active",
    department: "Activities",
    title: "Societies Administrator",
  },
  {
    key: "ruby_gislingham",
    fullName: "Ruby Gislingham",
    email: "ruby.gislingham@camp-site.co.uk",
    role: "manager",
    status: "active",
    department: "Events",
    title: "Events Manager",
  },
  {
    key: "isla_thorpe",
    fullName: "Isla Thorpe",
    email: "isla.thorpe@camp-site.co.uk",
    role: "coordinator",
    status: "active",
    department: "Events",
    title: "Events Coordinator",
  },
  {
    key: "sophie_morland",
    fullName: "Sophie Morland",
    email: "sophie.morland@camp-site.co.uk",
    role: "duty_manager",
    status: "active",
    department: "Commercial",
    title: "Bar Manager",
  },
  {
    key: "timothy_bartlett",
    fullName: "Timothy Bartlett",
    email: "timothy.bartlett@camp-site.co.uk",
    role: "csa",
    status: "active",
    department: "Communications & Digital Support",
    title: "Digital Support Assistant",
  },
  {
    key: "marcela_gomez_valdes",
    fullName: "Marcela Gomez Valdes",
    email: "marcela.gomez.valdes@camp-site.co.uk",
    role: "administrator",
    status: "active",
    department: "Student Engagement",
    title: "Student Engagement Administrator",
  },
  {
    key: "qa_society_lead",
    fullName: "QA Society Lead",
    email: "qa.society.lead@camp-site.co.uk",
    role: "society_leader",
    status: "active",
    department: "Demo Society",
    title: "Society President",
  },
  {
    key: "qa_pending",
    fullName: "QA Pending Member",
    email: "qa.pending@camp-site.co.uk",
    role: "unassigned",
    status: "pending",
    department: "Activities",
    title: "Pending Staff Member",
  },
  {
    key: "qa_inactive",
    fullName: "QA Inactive Member",
    email: "qa.inactive@camp-site.co.uk",
    role: "csa",
    status: "inactive",
    department: "Commercial",
    title: "Inactive Staff Member",
  },
];

const departments = [
  {
    name: "Senior Leadership",
    description: "Executive and cross-org QA decisions.",
    type: "department",
  },
  {
    name: "HR",
    description: "HR, onboarding, performance, cases, and private staff data.",
    type: "department",
  },
  {
    name: "Finance",
    description: "Payroll, wagesheets, discount controls, and finance reviews.",
    type: "department",
  },
  {
    name: "Activities",
    description: "Societies, sports, student groups, and activity support.",
    type: "department",
  },
  {
    name: "Events",
    description: "Venues, event delivery, operational comms, and cover.",
    type: "department",
  },
  {
    name: "Commercial",
    description: "Bars, retail, tills, discounts, and late shifts.",
    type: "department",
  },
  {
    name: "Student Engagement",
    description: "Campaigns, welcome, and student-facing support.",
    type: "department",
  },
  {
    name: "Communications & Digital Support",
    description: "Digital systems, website, and internal support.",
    type: "department",
  },
  {
    name: "Student Voice",
    description: "Representation, elections, and academic voice.",
    type: "department",
  },
  {
    name: "Demo Society",
    description: "A society-style department for society leader permissions.",
    type: "society",
  },
  {
    name: "Archived Lab",
    description: "Archived department to check hidden and historical UI states.",
    type: "department",
    is_archived: true,
  },
];

const report = {
  org: null,
  users: [],
  departments: [],
  warnings: [],
  skipped: [],
  featurePlan,
};

function log(message) {
  console.log(message);
}

function warn(message) {
  report.warnings.push(message);
  console.warn(`Warning: ${message}`);
}

function token(prefix) {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nowPlus(days, hour = 9, minute = 0) {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function datePlus(days) {
  return nowPlus(days).slice(0, 10);
}

/** Inclusive week end (Monday-based window when weekStart is a calendar date). */
function weekEndDateFromWeekStart(weekStartIso) {
  const d = new Date(`${weekStartIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Satisfies NOT NULL encrypted columns in payroll/medical seeds (not real ciphertext). */
const QA_SEED_ENCRYPTED_PLACEHOLDER = Buffer.from(
  JSON.stringify({ campsite_qa_seed: true }),
).toString("base64");

function byKey(map, key) {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing seeded value: ${key}`);
  }
  return value;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

async function runStep(name, fn, { optional = false } = {}) {
  log(`\n${name}`);
  try {
    return await fn();
  } catch (error) {
    if (optional) {
      const message = `${name} skipped: ${error.message}`;
      report.skipped.push(message);
      console.warn(message);
      return null;
    }
    throw error;
  }
}

async function maybeRpc(name, params) {
  const { error } = await supabase.rpc(name, params);
  if (error) {
    warn(`RPC ${name} skipped: ${error.message}`);
    return false;
  }
  return true;
}

async function mustInsert(table, rows, select = "*") {
  const payload = Array.isArray(rows) ? rows : [rows];
  if (!payload.length) return [];
  const { data, error } = await supabase.from(table).insert(payload).select(select);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return data ?? [];
}

async function maybeInsert(table, rows, select = "*") {
  const payload = Array.isArray(rows) ? rows : [rows];
  if (!payload.length) return [];
  const { data, error } = await supabase.from(table).insert(payload).select(select);
  if (error) {
    warn(`${table} skipped: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function mustUpsert(table, row, onConflict, select = "*") {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, { onConflict })
    .select(select)
    .single();
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return data;
}

async function maybeUpsert(table, row, onConflict, select = "*") {
  const { data, error } = await supabase
    .from(table)
    .upsert(row, { onConflict })
    .select(select)
    .single();
  if (error) {
    warn(`${table} skipped: ${error.message}`);
    return null;
  }
  return data;
}

async function maybeUpdate(table, values, column, value) {
  const { error } = await supabase.from(table).update(values).eq(column, value);
  if (error) {
    warn(`${table} update skipped: ${error.message}`);
    return false;
  }
  return true;
}

/** Departments have no unique on (org_id, name); upsert onConflict is invalid. */
async function ensureDepartmentRow(org, department) {
  const { data: existing, error: lookupError } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", org.id)
    .eq("name", department.name)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`departments: ${lookupError.message}`);
  }
  if (existing) {
    if (
      existing.description !== department.description ||
      existing.type !== department.type ||
      Boolean(existing.is_archived) !== Boolean(department.is_archived ?? false)
    ) {
      const { data: updated, error: updateError } = await supabase
        .from("departments")
        .update({
          description: department.description,
          type: department.type,
          is_archived: department.is_archived ?? false,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updateError) {
        warn(`departments update skipped (${department.name}): ${updateError.message}`);
        return existing;
      }
      return updated;
    }
    return existing;
  }
  const rows = await mustInsert(
    "departments",
    {
      org_id: org.id,
      name: department.name,
      description: department.description,
      type: department.type,
      is_archived: department.is_archived ?? false,
    },
    "*",
  );
  return rows[0];
}

async function findAuthUser(email) {
  const lowerEmail = email.toLowerCase();
  let page = 1;
  while (page < 25) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) {
      throw new Error(`Unable to list auth users for ${email}: ${error.message}`);
    }
    const user = data.users.find((candidate) => {
      return candidate.email?.toLowerCase() === lowerEmail;
    });
    if (user) return user;
    if (!data.users.length || data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

async function ensureAuthUser(persona) {
  const existing = await findAuthUser(persona.email);
  if (existing) {
    if (RESET_EXISTING_PASSWORDS) {
      const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
        email: persona.email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: persona.fullName,
          system_qa_seed: true,
        },
      });
      if (error) {
        throw new Error(`Unable to update auth user ${persona.email}: ${error.message}`);
      }
      return { id: data.user.id, created: false, passwordReset: true };
    }
    return { id: existing.id, created: false, passwordReset: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: persona.email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: persona.fullName,
      system_qa_seed: true,
    },
  });
  if (error) {
    throw new Error(`Unable to create auth user ${persona.email}: ${error.message}`);
  }
  return { id: data.user.id, created: true, passwordReset: false };
}

async function ensureOrganisation() {
  const { data: existing, error: lookupError } = await supabase
    .from("organisations")
    .select("*")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`Unable to check organisation: ${lookupError.message}`);
  }
  if (existing) {
    if (!CONTINUE) {
      throw new Error(
        [
          `Organisation slug '${ORG_SLUG}' already exists (partial or full seed from an earlier run).`,
          `To finish or re-apply seed rows into that org, run: npm run seed-system-qa:continue`,
          `Or: npm run seed-system-qa -- --continue`,
          `For a brand-new org instead, set CAMPSITE_SYSTEM_QA_ORG_SLUG (and optionally CAMPSITE_SYSTEM_QA_ORG_NAME) to unused values.`,
        ].join("\n"),
      );
    }
    return existing;
  }

  const rows = await mustInsert(
    "organisations",
    {
      name: ORG_NAME,
      slug: ORG_SLUG,
      is_active: true,
    },
    "*",
  );
  return rows[0];
}

async function seedOrgFoundation(org) {
  await maybeRpc("ensure_org_rbac_bootstrap", { p_org_id: org.id });
  await maybeRpc("seed_predefined_roles_for_org", { p_org_id: org.id });
  await maybeRpc("seed_predefined_role_permissions_for_org", { p_org_id: org.id });

  const deptMap = new Map();
  for (const department of departments) {
    const row = await ensureDepartmentRow(org, department);
    deptMap.set(department.name, row);
    report.departments.push({
      id: row.id,
      name: row.name,
      type: row.type,
      is_archived: row.is_archived,
    });
  }

  const userMap = new Map();
  for (const persona of personas) {
    const auth = await ensureAuthUser(persona);
    const department = byKey(deptMap, persona.department);
    const profileRow = compact({
      id: auth.id,
      org_id: ACTIVATE_PROFILES ? org.id : undefined,
      full_name: persona.fullName,
      email: persona.email,
      role: persona.role,
      status: persona.status,
      avatar_url: null,
      // Clear when re-pointing profiles at this org: trigger requires reports_to
      // to reference a profile with the same org_id (stale IDs fail on upsert).
      reports_to_user_id: null,
    });

    let profile = null;
    if (ACTIVATE_PROFILES) {
      profile = await mustUpsert("profiles", profileRow, "id", "*");
    } else {
      profile = await maybeUpsert("profiles", profileRow, "id", "*");
    }

    await maybeUpsert(
      "user_org_memberships",
      {
        user_id: auth.id,
        org_id: org.id,
        full_name: persona.fullName,
        email: persona.email,
        role: persona.role,
        status: persona.status,
      },
      "user_id,org_id",
      "*",
    );

    await maybeUpsert(
      "user_departments",
      {
        user_id: auth.id,
        dept_id: department.id,
      },
      "user_id,dept_id",
      "*",
    );

    if (
      persona.role === "org_admin" ||
      persona.role === "manager" ||
      persona.role === "duty_manager" ||
      persona.role === "chro_hr_director" ||
      persona.role === "head_hr"
    ) {
      await maybeUpsert(
        "dept_managers",
        {
          user_id: auth.id,
          dept_id: department.id,
        },
        "user_id,dept_id",
        "*",
      );
    }

    userMap.set(persona.key, {
      ...persona,
      id: auth.id,
      profile,
      department,
      auth,
    });
    report.users.push({
      key: persona.key,
      id: auth.id,
      email: persona.email,
      role: persona.role,
      status: persona.status,
      department: persona.department,
      created: auth.created,
      existingPasswordPreserved: !auth.created && !auth.passwordReset,
      passwordReset: auth.passwordReset,
    });
  }

  const teamRows = await maybeInsert(
    "department_teams",
    [
      {
        dept_id: byKey(deptMap, "Activities").id,
        name: "Activities Morning Cover",
        lead_user_id: byKey(userMap, "jane_trueman").id,
      },
      {
        dept_id: byKey(deptMap, "Events").id,
        name: "Event Duty Team",
        lead_user_id: byKey(userMap, "ruby_gislingham").id,
      },
      {
        dept_id: byKey(deptMap, "Commercial").id,
        name: "Late Bar Team",
        lead_user_id: byKey(userMap, "sophie_morland").id,
      },
    ],
    "*",
  );

  const teamMap = new Map(teamRows.map((team) => [team.name, team]));
  const teamMemberRows = [];
  for (const key of ["jane_trueman", "darcey_james", "imogen_greene", "damien_pearson"]) {
    const team = teamMap.get("Activities Morning Cover");
    if (team) {
      teamMemberRows.push({
        team_id: team.id,
        user_id: byKey(userMap, key).id,
      });
    }
  }
  for (const key of ["ruby_gislingham", "isla_thorpe"]) {
    const team = teamMap.get("Event Duty Team");
    if (team) {
      teamMemberRows.push({
        team_id: team.id,
        user_id: byKey(userMap, key).id,
      });
    }
  }
  for (const key of ["sophie_morland", "marcela_gomez_valdes"]) {
    const team = teamMap.get("Late Bar Team");
    if (team) {
      teamMemberRows.push({
        team_id: team.id,
        user_id: byKey(userMap, key).id,
      });
    }
  }
  await maybeInsert("department_team_members", teamMemberRows, "*");

  await maybeUpdate(
    "profiles",
    {
      dnd_enabled: true,
      dnd_start: "18:00",
      dnd_end: "08:00",
      shift_reminder_before_minutes: 60,
      rota_open_slot_alerts_enabled: true,
      ui_mode: "interactive",
    },
    "id",
    byKey(userMap, "olga_saskova").id,
  );
  await maybeUpdate(
    "profiles",
    {
      dnd_enabled: false,
      shift_reminder_before_minutes: 30,
      rota_open_slot_alerts_enabled: false,
      ui_mode: "classic",
    },
    "id",
    byKey(userMap, "timothy_bartlett").id,
  );

  return { deptMap, userMap, teamMap };
}

async function seedBroadcasts(org, deptMap, userMap, teamMap) {
  const di = (deptName) => byKey(deptMap, deptName).id;

  const channelRows = await maybeInsert(
    "broadcast_channels",
    [
      { dept_id: di("Senior Leadership"), name: "Leadership Announcements" },
      { dept_id: di("HR"), name: "HR Policy Updates" },
      { dept_id: di("Activities"), name: "Activities Ops" },
      { dept_id: di("Events"), name: "Events Ops" },
      { dept_id: di("Commercial"), name: "Commercial Ops" },
      { dept_id: di("Finance"), name: "Finance Ops" },
      { dept_id: di("Communications & Digital Support"), name: "Digital Support" },
      { dept_id: di("Student Voice"), name: "Student Voice Updates" },
    ],
    "*",
  );
  const channelMap = new Map(channelRows.map((channel) => [channel.name, channel]));

  const activityChannel = channelMap.get("Activities Ops");
  const eventsChannel = channelMap.get("Events Ops");
  const commercialChannel = channelMap.get("Commercial Ops");
  const hrChannel = channelMap.get("HR Policy Updates");
  const financeChannel = channelMap.get("Finance Ops");
  const commsChannel = channelMap.get("Digital Support");
  const studentVoiceChannel = channelMap.get("Student Voice Updates");

  await maybeInsert(
    "user_subscriptions",
    [
      { user_id: byKey(userMap, "darcey_james").id, channel_id: activityChannel?.id, subscribed: true },
      { user_id: byKey(userMap, "imogen_greene").id, channel_id: activityChannel?.id, subscribed: false },
      { user_id: byKey(userMap, "isla_thorpe").id, channel_id: eventsChannel?.id, subscribed: true },
      { user_id: byKey(userMap, "aarun_palmer").id, channel_id: financeChannel?.id, subscribed: true },
      { user_id: byKey(userMap, "timothy_bartlett").id, channel_id: commsChannel?.id, subscribed: true },
      { user_id: byKey(userMap, "damien_pearson").id, channel_id: hrChannel?.id, subscribed: true },
    ].filter((row) => row.channel_id),
    "*",
  );

  const eventDutyTeamId = teamMap.get("Event Duty Team")?.id ?? null;
  const lateBarTeamId = teamMap.get("Late Bar Team")?.id ?? null;

  const broadcasts = await maybeInsert(
    "broadcasts",
    [
      {
        org_id: org.id,
        dept_id: di("Senior Leadership"),
        created_by: byKey(userMap, "james_hann").id,
        channel_id: null,
        team_id: null,
        title: "Mandatory org update - read receipt required",
        body: "Seeded mandatory org-wide update for read/unread, pinned, and announcement banner checks.",
        status: "sent",
        is_org_wide: true,
        is_mandatory: true,
        is_pinned: true,
        sent_at: nowPlus(-4, 10),
      },
      {
        org_id: org.id,
        dept_id: di("Senior Leadership"),
        created_by: byKey(userMap, "tarek_khalil").id,
        channel_id: null,
        team_id: null,
        title: "Wellbeing week — org-wide kickoff",
        body: "Non-mandatory org-wide broadcast for feed variety and search snippets.",
        status: "sent",
        is_org_wide: true,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-6, 9),
      },
      {
        org_id: org.id,
        dept_id: di("Activities"),
        created_by: byKey(userMap, "jane_trueman").id,
        channel_id: activityChannel?.id ?? null,
        team_id: null,
        title: "Unread activities handover",
        body: "Left unread for selected users to exercise unread badges and notification counts.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-2, 14),
      },
      {
        org_id: org.id,
        dept_id: di("Activities"),
        created_by: byKey(userMap, "jane_trueman").id,
        channel_id: activityChannel?.id ?? null,
        team_id: teamMap.get("Activities Morning Cover")?.id ?? null,
        title: "Morning cover stand-up notes",
        body: "Team-scoped activities broadcast for roster and handover UI.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-3, 8),
      },
      {
        org_id: org.id,
        dept_id: di("Events"),
        created_by: byKey(userMap, "ruby_gislingham").id,
        channel_id: eventsChannel?.id ?? null,
        team_id: eventDutyTeamId,
        title: "Team targeted event cover note",
        body: "Team-targeted broadcast for duty-team visibility checks.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-1, 9),
      },
      {
        org_id: org.id,
        dept_id: di("Events"),
        created_by: byKey(userMap, "ruby_gislingham").id,
        channel_id: eventsChannel?.id ?? null,
        team_id: null,
        title: "Rota change — extra stewards needed",
        body: "Draft rota comms for composer and approval flows.",
        status: "draft",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
      },
      {
        org_id: org.id,
        dept_id: di("HR"),
        created_by: byKey(userMap, "olga_saskova").id,
        channel_id: hrChannel?.id ?? null,
        team_id: null,
        title: "Mid-year performance review window",
        body: "Performance cycle reminder: complete self-assessment before manager conversations. Links to review hub and HR drop-in sessions.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: true,
        sent_at: nowPlus(-5, 11),
      },
      {
        org_id: org.id,
        dept_id: di("HR"),
        created_by: byKey(userMap, "olga_saskova").id,
        channel_id: hrChannel?.id ?? null,
        team_id: null,
        title: "Leave, TOIL, and Bradford factor refresher",
        body: "Reminder on reporting lines for leave approval, TOIL requests, and sickness recording for Bradford visibility.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-7, 15),
      },
      {
        org_id: org.id,
        dept_id: di("HR"),
        created_by: byKey(userMap, "olga_saskova").id,
        channel_id: hrChannel?.id ?? null,
        team_id: null,
        title: "Draft HR policy post",
        body: "Draft seeded so editors can test composer resume and draft state.",
        status: "draft",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
      },
      {
        org_id: org.id,
        dept_id: di("Finance"),
        created_by: byKey(userMap, "aarun_palmer").id,
        channel_id: financeChannel?.id ?? null,
        team_id: null,
        title: "Month-end payroll cut-off",
        body: "Finance broadcast for deadlines, approvals, and wagesheet QA.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-2, 10),
      },
      {
        org_id: org.id,
        dept_id: di("Commercial"),
        created_by: byKey(userMap, "sophie_morland").id,
        channel_id: commercialChannel?.id ?? null,
        team_id: lateBarTeamId,
        title: "Late bar promo — staff discount weekend",
        body: "Pinned commercial team broadcast for tills and discount checks.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: true,
        sent_at: nowPlus(-1, 18),
      },
      {
        org_id: org.id,
        dept_id: di("Communications & Digital Support"),
        created_by: byKey(userMap, "timothy_bartlett").id,
        channel_id: commsChannel?.id ?? null,
        team_id: null,
        title: "Pending approval broadcast",
        body: "Requires approval and tests the pending approval queue.",
        status: "pending_approval",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
      },
      {
        org_id: org.id,
        dept_id: di("Commercial"),
        created_by: byKey(userMap, "sophie_morland").id,
        channel_id: commercialChannel?.id ?? null,
        team_id: null,
        title: "Scheduled commercial update",
        body: "Future post for scheduled broadcast state.",
        status: "scheduled",
        scheduled_at: nowPlus(3, 11),
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
      },
      {
        org_id: org.id,
        dept_id: di("Student Voice"),
        created_by: byKey(userMap, "marcela_gomez_valdes").id,
        channel_id: studentVoiceChannel?.id ?? null,
        team_id: null,
        title: "Student voice survey — spring pulse",
        body: "Cross-audience comms seed for student voice channel and read states.",
        status: "sent",
        is_org_wide: false,
        is_mandatory: false,
        is_pinned: false,
        sent_at: nowPlus(-8, 14),
      },
      {
        org_id: org.id,
        dept_id: di("Senior Leadership"),
        created_by: byKey(userMap, "james_hann").id,
        channel_id: null,
        team_id: null,
        title: "Cancelled leadership update",
        body: "Cancelled post for historical/cancelled UI state.",
        status: "cancelled",
        is_org_wide: true,
        is_mandatory: false,
        is_pinned: false,
      },
    ].filter((row) => row.dept_id && (row.is_org_wide || row.channel_id)),
    "*",
  );
  const broadcastMap = new Map(broadcasts.map((broadcast) => [broadcast.title, broadcast]));

  const mandatory = broadcastMap.get("Mandatory org update - read receipt required");
  const unread = broadcastMap.get("Unread activities handover");
  const teamTargeted = broadcastMap.get("Team targeted event cover note");
  const perfHr = broadcastMap.get("Mid-year performance review window");
  const financePayroll = broadcastMap.get("Month-end payroll cut-off");
  const wellbeing = broadcastMap.get("Wellbeing week — org-wide kickoff");

  await maybeInsert(
    "broadcast_reads",
    [
      { broadcast_id: mandatory?.id, user_id: byKey(userMap, "james_hann").id, read_at: nowPlus(-4, 12) },
      { broadcast_id: mandatory?.id, user_id: byKey(userMap, "olga_saskova").id, read_at: nowPlus(-3, 9) },
      { broadcast_id: mandatory?.id, user_id: byKey(userMap, "tarek_khalil").id, read_at: nowPlus(-4, 11) },
      { broadcast_id: wellbeing?.id, user_id: byKey(userMap, "jane_trueman").id, read_at: nowPlus(-5, 10) },
      { broadcast_id: unread?.id, user_id: byKey(userMap, "jane_trueman").id, read_at: nowPlus(-2, 15) },
      { broadcast_id: teamTargeted?.id, user_id: byKey(userMap, "ruby_gislingham").id, read_at: nowPlus(-1, 10) },
      { broadcast_id: teamTargeted?.id, user_id: byKey(userMap, "isla_thorpe").id, read_at: nowPlus(-1, 11) },
      { broadcast_id: perfHr?.id, user_id: byKey(userMap, "sarthak_peshin").id, read_at: nowPlus(-4, 14) },
      { broadcast_id: financePayroll?.id, user_id: byKey(userMap, "aarun_palmer").id, read_at: nowPlus(-2, 11) },
    ].filter((row) => row.broadcast_id),
    "*",
  );

  await maybeInsert(
    "broadcast_replies",
    [
      {
        org_id: org.id,
        broadcast_id: mandatory?.id,
        author_id: byKey(userMap, "tarek_khalil").id,
        body: "Leadership acknowledgement reply seeded for org-thread testing.",
        visibility: "org_thread",
      },
      {
        org_id: org.id,
        broadcast_id: unread?.id,
        author_id: byKey(userMap, "darcey_james").id,
        body: "Private follow-up reply seeded for private visibility checks.",
        visibility: "private_to_author",
      },
      {
        org_id: org.id,
        broadcast_id: perfHr?.id,
        author_id: byKey(userMap, "jane_trueman").id,
        body: "Activities will cascade this to team leads in our next stand-up.",
        visibility: "org_thread",
      },
      {
        org_id: org.id,
        broadcast_id: financePayroll?.id,
        author_id: byKey(userMap, "olga_saskova").id,
        body: "HR will remind managers to approve timesheets by Thursday COB.",
        visibility: "org_thread",
      },
    ].filter((row) => row.broadcast_id),
    "*",
  );

  await maybeInsert(
    "notifications",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        actor_id: byKey(userMap, "jane_trueman").id,
        type: "broadcast",
        title: "Unread activities handover",
        body: "Unread broadcast notification seeded.",
        read_at: null,
        entity_type: "broadcast",
        entity_id: unread?.id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "olga_saskova").id,
        actor_id: byKey(userMap, "james_hann").id,
        type: "broadcast",
        title: "Mandatory org update",
        body: "Read notification seeded.",
        read_at: nowPlus(-3, 10),
        entity_type: "broadcast",
        entity_id: mandatory?.id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "isla_thorpe").id,
        actor_id: byKey(userMap, "olga_saskova").id,
        type: "broadcast",
        title: "Performance review window",
        body: "Seeded performance-related broadcast notification.",
        read_at: null,
        entity_type: "broadcast",
        entity_id: perfHr?.id,
      },
    ].filter((row) => row.entity_id),
    "*",
  );

  return { channelMap, broadcastMap };
}

async function seedCalendarAttendanceLeavePayroll(org, deptMap, userMap, broadcastMap) {
  const siteRows = await maybeInsert(
    "work_sites",
    [
      {
        org_id: org.id,
        name: "Falmer House",
        lat: 50.8657,
        lng: -0.087,
        radius_m: 150,
        active: true,
      },
      {
        org_id: org.id,
        name: "Northfield Bar",
        lat: 50.8674,
        lng: -0.0879,
        radius_m: 90,
        active: true,
      },
      {
        org_id: org.id,
        name: "Archived Remote Site",
        lat: 50.867,
        lng: -0.09,
        radius_m: 50,
        active: false,
      },
    ],
    "*",
  );
  const siteMap = new Map(siteRows.map((site) => [site.name, site]));

  await maybeUpsert(
    "org_attendance_settings",
    {
      org_id: org.id,
      geo_strict: true,
      default_site_radius_m: 120,
      reject_allows_employee_resubmit: true,
      reject_allows_manager_correction: true,
    },
    "org_id",
    "*",
  );

  const eventRows = await maybeInsert(
    "calendar_events",
    [
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Activities").id,
        title: "Activities standup",
        description: "Manual event with accepted, tentative, and declined attendees.",
        start_time: nowPlus(1, 9),
        end_time: nowPlus(1, 9, 30),
        all_day: false,
        source: "manual",
        created_by: byKey(userMap, "jane_trueman").id,
      },
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Events").id,
        title: "Rota generated event placeholder",
        description: "Seeded rota-source calendar item.",
        start_time: nowPlus(2, 18),
        end_time: nowPlus(2, 23),
        all_day: false,
        source: "rota",
        created_by: byKey(userMap, "ruby_gislingham").id,
      },
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Senior Leadership").id,
        title: "Broadcast-linked all-day event",
        description: "Calendar item linked to a broadcast.",
        start_time: `${datePlus(4)}T00:00:00.000Z`,
        end_time: `${datePlus(4)}T23:59:59.999Z`,
        all_day: true,
        source: "broadcast",
        broadcast_id:
          broadcastMap.get("Mandatory org update - read receipt required")?.id ?? null,
        created_by: byKey(userMap, "james_hann").id,
      },
    ],
    "*",
  );
  const eventMap = new Map(eventRows.map((event) => [event.title, event]));

  const standup = eventMap.get("Activities standup");
  await maybeInsert(
    "calendar_event_attendees",
    [
      {
        org_id: org.id,
        event_id: standup?.id,
        profile_id: byKey(userMap, "jane_trueman").id,
        status: "accepted",
        invited_by: byKey(userMap, "jane_trueman").id,
      },
      {
        org_id: org.id,
        event_id: standup?.id,
        profile_id: byKey(userMap, "darcey_james").id,
        status: "tentative",
        invited_by: byKey(userMap, "jane_trueman").id,
      },
      {
        org_id: org.id,
        event_id: standup?.id,
        profile_id: byKey(userMap, "imogen_greene").id,
        status: "declined",
        invited_by: byKey(userMap, "jane_trueman").id,
      },
    ].filter((row) => row.event_id),
    "*",
  );

  const shiftStart = nowPlus(-1, 9);
  const shiftEnd = nowPlus(-1, 17);
  const lateStart = nowPlus(-2, 18);
  const lateEnd = nowPlus(-2, 23);
  const openStart = nowPlus(10, 17);
  const openEnd = nowPlus(10, 22);
  const insertedShifts = await maybeInsert(
    "rota_shifts",
    [
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Activities").id,
        user_id: byKey(userMap, "darcey_james").id,
        role_label: "Sports desk cover",
        start_time: shiftStart,
        end_time: shiftEnd,
        source: "manual",
        notes: "Seeded shift for rota and attendance linkage.",
      },
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Commercial").id,
        user_id: byKey(userMap, "sophie_morland").id,
        role_label: "Late bar duty manager",
        start_time: lateStart,
        end_time: lateEnd,
        source: "manual",
        notes: "Past shift for payroll adjacency.",
      },
      {
        org_id: org.id,
        dept_id: byKey(deptMap, "Events").id,
        user_id: null,
        role_label: "Open event steward slot",
        start_time: openStart,
        end_time: openEnd,
        source: "manual",
        notes: "Open slot (unassigned user_id) for claim UI.",
      },
    ],
    "*",
  );
  const activityShift = insertedShifts[0];
  const commercialShift = insertedShifts[1];
  const openShift = insertedShifts[2];
  if (activityShift?.id && commercialShift?.id) {
    await maybeInsert(
      "rota_change_requests",
      [
        {
          org_id: org.id,
          request_type: "swap",
          primary_shift_id: activityShift.id,
          counterparty_shift_id: commercialShift.id,
          requested_by: byKey(userMap, "darcey_james").id,
          counterparty_user_id: byKey(userMap, "sophie_morland").id,
          status: "pending_peer",
          note: "Seeded swap request for rota approvals UI.",
        },
        {
          org_id: org.id,
          request_type: "change",
          primary_shift_id: (openShift ?? activityShift).id,
          counterparty_shift_id: null,
          requested_by: byKey(userMap, "ruby_gislingham").id,
          counterparty_user_id: null,
          status: "pending_final",
          note: "Seeded change request pending final approval.",
        },
      ],
      "*",
    );
  }

  await maybeInsert(
    "attendance_events",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        work_site_id: siteMap.get("Falmer House")?.id,
        clocked_at: shiftStart,
        direction: "in",
        lat: 50.8658,
        lng: -0.087,
        within_site: true,
        source: "self_web",
        created_by: byKey(userMap, "darcey_james").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        work_site_id: siteMap.get("Falmer House")?.id,
        clocked_at: shiftEnd,
        direction: "out",
        lat: 50.8658,
        lng: -0.087,
        within_site: true,
        source: "self_web",
        created_by: byKey(userMap, "darcey_james").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        work_site_id: siteMap.get("Northfield Bar")?.id,
        clocked_at: lateStart,
        direction: "in",
        lat: 50.9,
        lng: -0.11,
        within_site: false,
        source: "manager_proxy",
        manager_reason: "Seeded proxy clock-in (out of geofence).",
        created_by: byKey(userMap, "aarun_palmer").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        work_site_id: siteMap.get("Northfield Bar")?.id,
        clocked_at: lateEnd,
        direction: "out",
        lat: 50.8674,
        lng: -0.0879,
        within_site: true,
        source: "self_mobile",
        created_by: byKey(userMap, "sophie_morland").id,
      },
    ].filter((row) => row.work_site_id),
    "*",
  );

  const weekStart = datePlus(-14);
  const weekEnd = weekEndDateFromWeekStart(weekStart);
  const draftWeekStart = datePlus(-28);
  const draftWeekEnd = weekEndDateFromWeekStart(draftWeekStart);

  const timesheets = await maybeInsert(
    "weekly_timesheets",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        status: "submitted",
        reported_total_minutes: 480,
        submitted_at: nowPlus(-1, 18),
        submitted_by: byKey(userMap, "darcey_james").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        status: "approved",
        reported_total_minutes: 300,
        approved_total_minutes: 300,
        submitted_at: nowPlus(-2, 23),
        submitted_by: byKey(userMap, "sophie_morland").id,
        decided_at: nowPlus(-1, 10),
        decided_by: byKey(userMap, "aarun_palmer").id,
        decision_note: "Seeded manager+finance approval.",
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        status: "rejected",
        reported_total_minutes: 420,
        submitted_at: nowPlus(-2, 17),
        decided_at: nowPlus(-1, 11),
        decided_by: byKey(userMap, "aarun_palmer").id,
        decision_note: "Seeded rejection state for finance review.",
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "isla_thorpe").id,
        week_start_date: draftWeekStart,
        week_end_date: draftWeekEnd,
        status: "draft",
        reported_total_minutes: 120,
      },
    ],
    "*",
  );

  await maybeInsert(
    "wagesheet_lines",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        week_start_date: weekStart,
        line_type: "basic",
        description: "Seeded basic hours",
        hours: 8,
        hourly_rate_gbp: 12.5,
        amount_gbp: 100,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        week_start_date: weekStart,
        line_type: "overtime",
        description: "Seeded overtime",
        hours: 5,
        hourly_rate_gbp: 15,
        amount_gbp: 75,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        week_start_date: weekStart,
        line_type: "adjustment",
        description: "Seeded adjustment line",
        hours: 0,
        hourly_rate_gbp: 0,
        amount_gbp: -12.5,
      },
    ],
    "*",
  );

  await maybeInsert(
    "payroll_wagesheet_reviews",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        week_start_date: weekStart,
        review_status: "pending_finance",
        finance_note: "Seeded batch awaiting finance sign-off.",
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        week_start_date: datePlus(-35),
        review_status: "finance_approved",
        finance_approved_by: byKey(userMap, "aarun_palmer").id,
        finance_approved_at: nowPlus(-10, 11),
        finance_note: "Seeded approved historical batch.",
      },
    ],
    "*",
  );

  await maybeUpsert(
    "org_leave_settings",
    {
      org_id: org.id,
      bradford_window_days: 365,
      leave_year_start_month: 8,
      leave_year_start_day: 1,
      toil_minutes_per_day: 480,
    },
    "org_id",
    "*",
  );

  const leaveYearKey = String(new Date().getUTCFullYear());
  await maybeInsert(
    "leave_allowances",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "jane_trueman").id,
        leave_year: leaveYearKey,
        annual_entitlement_days: 28,
        toil_balance_days: 1.25,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        leave_year: leaveYearKey,
        annual_entitlement_days: 20,
        toil_balance_days: 0.5,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        leave_year: leaveYearKey,
        annual_entitlement_days: 18,
        toil_balance_days: 0,
      },
    ],
    "*",
  );

  const leaveRequests = await maybeInsert(
    "leave_requests",
    [
      {
        org_id: org.id,
        requester_id: byKey(userMap, "darcey_james").id,
        kind: "annual",
        status: "pending",
        start_date: datePlus(10),
        end_date: datePlus(12),
        note: "Pending annual leave for approval queue.",
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "jane_trueman").id,
        kind: "annual",
        status: "approved",
        start_date: datePlus(-20),
        end_date: datePlus(-18),
        note: "Approved annual leave history.",
        decided_at: nowPlus(-21, 11),
        decided_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "timothy_bartlett").id,
        kind: "annual",
        status: "rejected",
        start_date: datePlus(6),
        end_date: datePlus(6),
        note: "Rejected leave request.",
        decision_note: "Seeded conflict with team cover.",
        decided_at: nowPlus(-1, 9),
        decided_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "sophie_morland").id,
        kind: "toil",
        status: "cancelled",
        start_date: datePlus(2),
        end_date: datePlus(2),
        note: "Cancelled TOIL booking.",
      },
    ],
    "*",
  );
  const leaveMap = new Map(leaveRequests.map((leave) => [leave.status, leave]));

  await maybeInsert(
    "leave_notifications",
    [
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "jane_trueman").id,
        leave_request_id: leaveMap.get("approved")?.id,
        event: "leave_approved",
        actor_name: "Olga Saskova",
        read_at: null,
      },
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "timothy_bartlett").id,
        leave_request_id: leaveMap.get("rejected")?.id,
        event: "leave_rejected",
        actor_name: "Olga Saskova",
        read_at: nowPlus(-1, 10),
      },
    ].filter((row) => row.leave_request_id),
    "*",
  );

  await maybeInsert(
    "sickness_absences",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "isla_thorpe").id,
        start_date: datePlus(-5),
        end_date: datePlus(-3),
        notes: "Closed sickness episode (seed).",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sarthak_peshin").id,
        start_date: datePlus(0),
        end_date: datePlus(0),
        notes: "Open same-day sickness episode (seed).",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "toil_credit_requests",
    [
      {
        org_id: org.id,
        requester_id: byKey(userMap, "sophie_morland").id,
        work_date: datePlus(-2),
        minutes_earned: 180,
        status: "pending",
        note: "Late event cover (seed).",
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "ruby_gislingham").id,
        work_date: datePlus(-8),
        minutes_earned: 120,
        status: "approved",
        note: "Weekend event delivery (seed).",
        decided_by: byKey(userMap, "olga_saskova").id,
        decided_at: nowPlus(-6, 10),
        decision_note: "Approved TOIL credit.",
      },
    ],
    "*",
  );
}

async function seedHr(org, deptMap, userMap) {
  void deptMap;
  await maybeUpsert("org_hr_metric_settings", { org_id: org.id }, "org_id", "*");

  await maybeUpsert(
    "org_leave_settings",
    {
      org_id: org.id,
      encashment_enabled: true,
      encashment_requires_approval: true,
      encashment_max_days: 5,
      carry_over_enabled: true,
      carry_over_requires_approval: true,
      carry_over_max_days: 5,
    },
    "org_id",
    "*",
  );

  const rtwPalette = [
    "verified",
    "verified",
    "in_progress",
    "required",
    "unknown",
    "expired",
    "not_required",
    "verified",
    "verified",
  ];

  const hrRecords = [];
  let hrIdx = 0;
  for (const persona of personas.filter((item) => item.status !== "pending")) {
    const user = byKey(userMap, persona.key);
    const contractType =
      persona.role === "csa"
        ? "zero_hours"
        : persona.role === "duty_manager"
          ? "part_time"
          : "full_time";
    const salaryBand =
      persona.role === "csa"
        ? "GBP 12.21 per hour"
        : persona.role === "duty_manager"
          ? "GBP 14.25 per hour"
          : persona.role === "manager" || persona.role === "org_admin"
            ? "GBP 42,000"
            : "GBP 24,000 - 28,000";
    const rtwStatus = rtwPalette[hrIdx % rtwPalette.length];
    hrIdx += 1;
    const empStart = datePlus(persona.status === "inactive" ? -700 : -220);
    const contractStart = datePlus(persona.status === "inactive" ? -695 : -215);
    const contractSigned = datePlus(persona.status === "inactive" ? -690 : -210);
    hrRecords.push({
      org_id: org.id,
      user_id: user.id,
      job_title: persona.title,
      grade_level: "Seeded",
      contract_type: contractType,
      salary_band: salaryBand,
      fte: persona.role === "duty_manager" ? 0.8 : 1.0,
      work_location: persona.department === "Communications & Digital Support" ? "remote" : "hybrid",
      employment_start_date: empStart,
      probation_end_date: datePlus(persona.status === "inactive" ? -500 : 60),
      notice_period_weeks: persona.role === "org_admin" ? 12 : 8,
      position_type: persona.role === "csa" ? "Casual" : "Permanent",
      pay_grade: persona.role === "org_admin" ? "Exec" : "Spine 5",
      employment_basis: "permanent",
      weekly_hours: persona.role === "duty_manager" ? 21.0 : 37.5,
      positions_count: 1,
      budget_amount: persona.role === "org_admin" ? null : 32000,
      budget_currency: "GBP",
      department_start_date: empStart,
      continuous_employment_start_date: empStart,
      custom_fields: { qa_seed: true, persona_key: persona.key },
      contract_start_date: contractStart,
      contract_end_date: persona.role === "csa" ? datePlus(400) : null,
      contract_signed_on: contractSigned,
      contract_document_url: `https://example.invalid/qa-seed/contracts/${persona.key}.pdf`,
      contract_review_date: datePlus(365),
      home_address_line1: `${hrIdx} Seeded Terrace`,
      home_address_line2: "QA Row",
      home_city: "Brighton",
      home_county: "East Sussex",
      home_postcode: "BN1 1SE",
      home_country: "United Kingdom",
      emergency_contact_name: "QA Emergency Contact",
      emergency_contact_relationship: "Partner",
      emergency_contact_phone: "07700900001",
      emergency_contact_email: `qa.emergency.${persona.key}@camp-site.co.uk`,
      rtw_status: rtwStatus,
      rtw_checked_on: rtwStatus === "verified" || rtwStatus === "expired" ? datePlus(-120) : null,
      rtw_expiry_date: rtwStatus === "expired" ? datePlus(-10) : rtwStatus === "verified" ? datePlus(500) : null,
      rtw_check_method: rtwStatus === "unknown" ? "" : "online_service",
      rtw_document_url:
        rtwStatus === "not_required" ? "" : `https://example.invalid/qa-seed/rtw/${persona.key}.pdf`,
      visa_type: rtwStatus === "in_progress" ? "Student visa (seed)" : "",
      notes:
        persona.status === "inactive"
          ? "Seeded inactive employee — contract ended (QA)."
          : "Seeded HR core record for System QA Lab.",
      created_by: byKey(userMap, "olga_saskova").id,
    });
  }
  const insertedHrRecords = await maybeInsert("employee_hr_records", hrRecords, "*");
  const hrByUser = new Map(insertedHrRecords.map((record) => [record.user_id, record]));

  const docPath = (suffix) => `${org.id}/qa-hr/${randomBytes(8).toString("hex")}/${suffix}`;

  const docCategories = await maybeInsert(
    "employee_document_categories",
    [
      {
        org_id: org.id,
        name: "Staff handbook acknowledgements",
        document_kind_scope: "supporting_document",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "Professional registration",
        document_kind_scope: "id_document",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const handbookCategoryId = docCategories.find((row) => row.name === "Staff handbook acknowledgements")?.id;
  const proRegCategoryId = docCategories.find((row) => row.name === "Professional registration")?.id;

  await maybeInsert(
    "employee_hr_documents",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        category: "right_to_work",
        label: "Right to work evidence",
        storage_path: docPath("darcey-rtw.pdf"),
        file_name: "right-to-work.pdf",
        mime_type: "application/pdf",
        byte_size: 102400,
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "olga_saskova").id,
        category: "contract",
        label: "Signed contract",
        storage_path: docPath("olga-contract.pdf"),
        file_name: "contract.pdf",
        mime_type: "application/pdf",
        byte_size: 204800,
        uploaded_by: byKey(userMap, "james_hann").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        category: "other",
        label: "Training certificate (seed)",
        storage_path: docPath("timothy-training.pdf"),
        file_name: "training.pdf",
        mime_type: "application/pdf",
        byte_size: 51200,
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        category: "passport",
        label: "Passport (identity)",
        storage_path: docPath("sophie-passport.pdf"),
        file_name: "passport.pdf",
        mime_type: "application/pdf",
        byte_size: 88000,
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "jane_trueman").id,
        category: "signed_other",
        label: "Signed handbook v3",
        storage_path: docPath("jane-handbook.pdf"),
        file_name: "handbook.pdf",
        mime_type: "application/pdf",
        byte_size: 64000,
        ...(handbookCategoryId ? { custom_category_id: handbookCategoryId } : {}),
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "ruby_gislingham").id,
        category: "other",
        label: "First aid certificate",
        storage_path: docPath("ruby-first-aid.pdf"),
        file_name: "first-aid.pdf",
        mime_type: "application/pdf",
        byte_size: 72000,
        ...(proRegCategoryId ? { custom_category_id: proRegCategoryId } : {}),
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_training_records",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        title: "Safeguarding essentials",
        provider: "CampSite QA",
        status: "completed",
        started_on: datePlus(-120),
        completed_on: datePlus(-40),
        expires_on: datePlus(320),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "isla_thorpe").id,
        title: "Event incident response",
        provider: "CampSite QA",
        status: "in_progress",
        started_on: datePlus(-5),
        expires_on: datePlus(12),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        title: "Food safety",
        provider: "CampSite QA",
        status: "expired",
        started_on: datePlus(-500),
        completed_on: datePlus(-420),
        expires_on: datePlus(-55),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "jane_trueman").id,
        title: "People manager essentials",
        provider: "CampSite QA",
        status: "completed",
        started_on: datePlus(-200),
        completed_on: datePlus(-150),
        expires_on: datePlus(550),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "olga_saskova").id,
        title: "GDPR refresher",
        provider: "CampSite QA",
        status: "in_progress",
        started_on: datePlus(-14),
        expires_on: datePlus(350),
        created_by: byKey(userMap, "james_hann").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_bank_details",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        status: "pending",
        is_active: false,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        account_holder_display: "Darcey James",
        account_number_last4: "3344",
        sort_code_last4: "1122",
        submitted_by: byKey(userMap, "darcey_james").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        status: "approved",
        is_active: true,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        account_holder_display: "Sophie Morland",
        account_number_last4: "7788",
        sort_code_last4: "5566",
        submitted_by: byKey(userMap, "sophie_morland").id,
        reviewed_by: byKey(userMap, "aarun_palmer").id,
        reviewed_at: nowPlus(-19, 12),
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        status: "rejected",
        is_active: false,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        account_holder_display: "Timothy Bartlett",
        account_number_last4: "0000",
        sort_code_last4: "9999",
        submitted_by: byKey(userMap, "timothy_bartlett").id,
        reviewed_by: byKey(userMap, "aarun_palmer").id,
        reviewed_at: nowPlus(-9, 12),
        review_note: "Seeded invalid detail state.",
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_uk_tax_details",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        status: "pending",
        is_active: false,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        tax_code_masked: "1257L",
        tax_code_last2: "7L",
        submitted_by: byKey(userMap, "darcey_james").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        status: "rejected",
        is_active: false,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        tax_code_masked: "0T",
        tax_code_last2: "0T",
        submitted_by: byKey(userMap, "timothy_bartlett").id,
        reviewed_by: byKey(userMap, "aarun_palmer").id,
        reviewed_at: nowPlus(-8, 10),
        review_note: "Seeded NI mismatch — resubmit (QA).",
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        status: "approved",
        is_active: true,
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        tax_code_masked: "BR",
        tax_code_last2: "BR",
        submitted_by: byKey(userMap, "sophie_morland").id,
        reviewed_by: byKey(userMap, "aarun_palmer").id,
        reviewed_at: nowPlus(-14, 14),
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_medical_notes",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "isla_thorpe").id,
        case_ref: `QA-FIT-${randomBytes(4).toString("hex")}`,
        status: "fit_note_received",
        review_date: datePlus(7),
        summary_for_employee: "Fit note logged (seed).",
        encrypted_sensitive_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sarthak_peshin").id,
        case_ref: `QA-OH-${randomBytes(4).toString("hex")}`,
        status: "open",
        referral_reason: "Workplace adjustment review (seed).",
        encrypted_sensitive_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_dependants",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "jane_trueman").id,
        full_name: "QA Dependant",
        relationship: "Child",
        date_of_birth: "2016-04-12",
        phone: "07000000001",
        is_emergency_contact: true,
        is_beneficiary: false,
        created_by: byKey(userMap, "jane_trueman").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "aarun_palmer").id,
        full_name: "QA Pension Beneficiary",
        relationship: "Spouse",
        date_of_birth: "1988-03-01",
        is_beneficiary: true,
        is_emergency_contact: false,
        beneficiary_percentage: 100,
        email: "qa.beneficiary@camp-site.co.uk",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_employment_history",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "qa_inactive").id,
        role_title: "Bar support",
        department_name: "Commercial",
        start_date: datePlus(-900),
        end_date: datePlus(-30),
        change_reason: "Moved to inactive QA state (seed).",
        source: "manual",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        role_title: "Sports coordinator",
        department_name: "Activities",
        start_date: datePlus(-400),
        end_date: null,
        change_reason: "Promotion (seed).",
        source: "manual",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "sarthak_peshin").id,
        role_title: "HR assistant",
        department_name: "HR",
        start_date: datePlus(-800),
        end_date: datePlus(-200),
        change_reason: "Internal move to HR coordinator (seed).",
        source: "manual",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  const customFields = await maybeInsert(
    "hr_custom_field_definitions",
    [
      {
        org_id: org.id,
        key: "preferred_campus",
        label: "Preferred campus",
        field_type: "select",
        options: ["Falmer", "Northfield", "Remote"],
        is_required: false,
        sort_order: 10,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        key: "keyholder_access",
        label: "Has keyholder access",
        field_type: "boolean",
        options: [],
        is_required: false,
        sort_order: 20,
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const fieldMap = new Map(customFields.map((field) => [field.key, field]));

  await maybeInsert(
    "hr_custom_field_values",
    [
      {
        org_id: org.id,
        definition_id: fieldMap.get("preferred_campus")?.id,
        user_id: byKey(userMap, "sophie_morland").id,
        value: "Northfield",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        definition_id: fieldMap.get("keyholder_access")?.id,
        user_id: byKey(userMap, "sophie_morland").id,
        value: true,
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ].filter((row) => row.definition_id),
    "*",
  );

  const leaveYearLabel = String(new Date().getUTCFullYear());

  await maybeInsert(
    "employee_tax_documents",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        document_type: "p60",
        tax_year: String(new Date().getUTCFullYear() - 1),
        issue_date: datePlus(-90),
        status: "issued",
        storage_path: docPath("sophie-p60.pdf"),
        file_name: "P60-seed.pdf",
        mime_type: "application/pdf",
        byte_size: 96000,
        uploaded_by: byKey(userMap, "aarun_palmer").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        document_type: "p45",
        tax_year: String(new Date().getUTCFullYear() - 2),
        issue_date: datePlus(-400),
        status: "issued",
        storage_path: docPath("timothy-p45.pdf"),
        file_name: "P45-seed.pdf",
        mime_type: "application/pdf",
        byte_size: 48000,
        uploaded_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "employee_case_records",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "qa_inactive").id,
        case_type: "disciplinary",
        case_ref: `QA-DISC-${randomBytes(4).toString("hex")}`,
        category: "Attendance",
        severity: "low",
        status: "closed",
        incident_date: datePlus(-200),
        reported_date: datePlus(-198),
        summary: "Seeded closed low-level attendance case (inactive employee).",
        outcome_action: "Informal warning on file.",
        owner_user_id: byKey(userMap, "olga_saskova").id,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "imogen_greene").id,
        case_type: "disciplinary",
        case_ref: `QA-DISC-${randomBytes(4).toString("hex")}`,
        category: "Conduct",
        severity: "medium",
        status: "investigating",
        incident_date: datePlus(-14),
        reported_date: datePlus(-13),
        summary: "Seeded open investigation for interim cover QA.",
        allegations_details: "Alleged breach of confidentiality during handover (seed).",
        owner_user_id: byKey(userMap, "olga_saskova").id,
        investigator_user_id: byKey(userMap, "james_hann").id,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "damien_pearson").id,
        case_type: "grievance",
        case_ref: `QA-GRV-${randomBytes(4).toString("hex")}`,
        category: "Working conditions",
        status: "hearing",
        incident_date: datePlus(-40),
        reported_date: datePlus(-38),
        hearing_date: datePlus(10),
        summary: "Seeded grievance at hearing stage.",
        owner_user_id: byKey(userMap, "olga_saskova").id,
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "payroll_role_hourly_rates",
    [
      {
        org_id: org.id,
        role_code: "csa",
        effective_from: datePlus(-730),
        effective_to: datePlus(-1),
        hourly_rate_gbp: 12.21,
        notes: "Historical CSA rate (seed).",
        created_by: byKey(userMap, "aarun_palmer").id,
      },
      {
        org_id: org.id,
        role_code: "csa",
        effective_from: datePlus(0),
        hourly_rate_gbp: 12.6,
        notes: "Current CSA rate (seed).",
        created_by: byKey(userMap, "aarun_palmer").id,
      },
      {
        org_id: org.id,
        role_code: "dm",
        effective_from: datePlus(-400),
        hourly_rate_gbp: 14.25,
        notes: "Duty manager hourly (seed).",
        created_by: byKey(userMap, "aarun_palmer").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "payroll_employee_pay_profiles",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "sophie_morland").id,
        pay_role: "dm",
        notes: "Seeded duty manager pay profile.",
        updated_by: byKey(userMap, "aarun_palmer").id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        pay_role: "csa",
        notes: "Seeded CSA hourly pay profile.",
        updated_by: byKey(userMap, "aarun_palmer").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "payroll_manual_adjustments",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        week_start_date: datePlus(-21),
        adjustment_code: "manual_override",
        amount_gbp: 42.5,
        note: "Seeded weekend event uplift (QA).",
        created_by: byKey(userMap, "aarun_palmer").id,
      },
    ],
    "*",
  );

  await maybeInsert(
    "leave_encashment_requests",
    [
      {
        org_id: org.id,
        requester_id: byKey(userMap, "jane_trueman").id,
        leave_year: leaveYearLabel,
        days_requested: 2,
        days_approved: 2,
        note: "Seeded approved encashment (QA).",
        status: "approved",
        decided_by: byKey(userMap, "olga_saskova").id,
        decided_at: nowPlus(-20, 11),
        decision_note: "Approved within cap.",
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "isla_thorpe").id,
        leave_year: leaveYearLabel,
        days_requested: 1.5,
        note: "Awaiting manager decision (seed).",
        status: "pending",
      },
    ],
    "*",
  );

  await maybeInsert(
    "leave_carryover_requests",
    [
      {
        org_id: org.id,
        requester_id: byKey(userMap, "darcey_james").id,
        from_leave_year: String(Number(leaveYearLabel) - 1),
        to_leave_year: leaveYearLabel,
        days_requested: 3,
        days_approved: 3,
        status: "approved",
        decided_by: byKey(userMap, "jane_trueman").id,
        decided_at: nowPlus(-60, 9),
        decision_note: "Seeded carry-over within policy cap.",
      },
      {
        org_id: org.id,
        requester_id: byKey(userMap, "ruby_gislingham").id,
        from_leave_year: leaveYearLabel,
        to_leave_year: String(Number(leaveYearLabel) + 1),
        days_requested: 2,
        status: "pending",
        note: "Seeded pending carry-over into next leave year.",
      },
    ],
    "*",
  );

  return { hrByUser };
}

async function seedHiring(org, deptMap, userMap) {
  const requests = await maybeInsert(
    "recruitment_requests",
    [
      {
        org_id: org.id,
        department_id: byKey(deptMap, "Activities").id,
        created_by: byKey(userMap, "jane_trueman").id,
        job_title: "Student Activities Assistant",
        grade_level: "Grade 3",
        salary_band: "GBP 23,000 - 25,000",
        reason_for_hire: "new_role",
        start_date_needed: datePlus(35),
        contract_type: "full_time",
        ideal_candidate_profile: "Strong student group support experience.",
        specific_requirements: "Evening availability during welcome period.",
        status: "pending_review",
        urgency: "high",
      },
      {
        org_id: org.id,
        department_id: byKey(deptMap, "Commercial").id,
        created_by: byKey(userMap, "sophie_morland").id,
        job_title: "Bar Shift Supervisor",
        grade_level: "Grade 4",
        salary_band: "GBP 13.50 per hour",
        reason_for_hire: "backfill",
        start_date_needed: datePlus(21),
        contract_type: "part_time",
        ideal_candidate_profile: "Confident duty supervisor for late trading.",
        specific_requirements: "Personal licence desirable.",
        status: "approved",
        urgency: "normal",
      },
      {
        org_id: org.id,
        department_id: byKey(deptMap, "Events").id,
        created_by: byKey(userMap, "ruby_gislingham").id,
        job_title: "Event Steward Pool",
        grade_level: "Casual",
        salary_band: "GBP 12.21 per hour",
        reason_for_hire: "backfill",
        start_date_needed: datePlus(14),
        contract_type: "seasonal",
        ideal_candidate_profile: "Casual stewarding availability.",
        specific_requirements: "Weekend and evening shifts.",
        status: "in_progress",
        urgency: "low",
      },
      {
        org_id: org.id,
        department_id: byKey(deptMap, "HR").id,
        created_by: byKey(userMap, "olga_saskova").id,
        job_title: "HR Systems Analyst",
        grade_level: "Grade 5",
        salary_band: "GBP 32,000 - 36,000",
        reason_for_hire: "new_role",
        start_date_needed: datePlus(70),
        contract_type: "full_time",
        ideal_candidate_profile: "HRIS and reporting experience.",
        specific_requirements: "Data protection awareness.",
        status: "rejected",
        urgency: "normal",
      },
      {
        org_id: org.id,
        department_id: byKey(deptMap, "Finance").id,
        created_by: byKey(userMap, "aarun_palmer").id,
        job_title: "Payroll Assistant (fixed term)",
        grade_level: "Grade 4",
        salary_band: "GBP 26,000 - 29,000",
        reason_for_hire: "new_role",
        start_date_needed: datePlus(45),
        contract_type: "full_time",
        ideal_candidate_profile: "Payroll admin and pensions exposure.",
        specific_requirements: "SAGE or similar payroll tooling.",
        status: "pending_review",
        urgency: "normal",
      },
      {
        org_id: org.id,
        department_id: byKey(deptMap, "Student Engagement").id,
        created_by: byKey(userMap, "marcela_gomez_valdes").id,
        job_title: "Welcome Week Coordinator (filled)",
        grade_level: "Grade 3",
        salary_band: "GBP 24,500",
        reason_for_hire: "backfill",
        start_date_needed: datePlus(-60),
        contract_type: "full_time",
        ideal_candidate_profile: "Campaign delivery during peak arrivals.",
        specific_requirements: "Evening and weekend availability.",
        status: "filled",
        urgency: "high",
        archived_at: nowPlus(-45, 15),
      },
    ],
    "*",
  );
  const requestMap = new Map(requests.map((request) => [request.job_title, request]));

  const listings = await maybeInsert(
    "job_listings",
    [
      {
        org_id: org.id,
        recruitment_request_id: requestMap.get("Student Activities Assistant")?.id,
        department_id: byKey(deptMap, "Activities").id,
        created_by: byKey(userMap, "jane_trueman").id,
        slug: `${ORG_SLUG}-student-activities-assistant`,
        title: "Student Activities Assistant",
        grade_level: "Grade 3",
        salary_band: "GBP 23,000 - 25,000",
        contract_type: "full_time",
        advert_copy: "Help societies, sports clubs, and student groups thrive.",
        requirements: "Experience supporting volunteers and running student events.",
        benefits: "Flexible working, training budget, and campus discounts.",
        application_mode: "combination",
        allow_cv: true,
        allow_loom: true,
        allow_staffsavvy: true,
        status: "draft",
      },
      {
        org_id: org.id,
        recruitment_request_id: requestMap.get("Bar Shift Supervisor")?.id,
        department_id: byKey(deptMap, "Commercial").id,
        created_by: byKey(userMap, "sophie_morland").id,
        slug: `${ORG_SLUG}-bar-shift-supervisor`,
        title: "Bar Shift Supervisor",
        grade_level: "Grade 4",
        salary_band: "GBP 13.50 per hour",
        contract_type: "part_time",
        advert_copy: "Lead late bar shifts and support student staff.",
        requirements: "Supervisory hospitality experience.",
        benefits: "Paid training and staff discount.",
        application_mode: "cv",
        allow_cv: true,
        allow_loom: false,
        allow_staffsavvy: false,
        status: "live",
        published_at: nowPlus(-5, 9),
      },
      {
        org_id: org.id,
        recruitment_request_id: requestMap.get("Event Steward Pool")?.id,
        department_id: byKey(deptMap, "Events").id,
        created_by: byKey(userMap, "ruby_gislingham").id,
        slug: `${ORG_SLUG}-event-steward-pool`,
        title: "Event Steward Pool",
        grade_level: "Casual",
        salary_band: "GBP 12.21 per hour",
        contract_type: "seasonal",
        advert_copy: "Join the casual events team for gigs and society nights.",
        requirements: "Friendly, reliable, and calm under pressure.",
        benefits: "Flexible shifts.",
        application_mode: "loom",
        allow_cv: false,
        allow_loom: true,
        allow_staffsavvy: false,
        status: "archived",
        published_at: nowPlus(-30, 9),
      },
    ].filter((row) => row.recruitment_request_id),
    "*",
  );
  const listingMap = new Map(listings.map((listing) => [listing.title, listing]));

  const liveListing = listingMap.get("Bar Shift Supervisor");
  const screeningQuestions = await maybeInsert(
    "job_listing_screening_questions",
    liveListing
      ? [
          {
            job_listing_id: liveListing.id,
            sort_order: 0,
            question_type: "yes_no",
            prompt: "Do you hold a valid personal licence for alcohol retail (UK)?",
            required: true,
          },
          {
            job_listing_id: liveListing.id,
            sort_order: 1,
            question_type: "single_choice",
            prompt: "Which earliest shift start can you usually commit to?",
            required: true,
            options: ["17:00", "18:00", "19:00"],
          },
          {
            job_listing_id: liveListing.id,
            sort_order: 2,
            question_type: "short_text",
            prompt: "Briefly describe supervisory experience in hospitality.",
            required: false,
            max_length: 500,
          },
        ]
      : [],
    "*",
  );

  const appQuestionSets = await maybeInsert(
    "org_application_question_sets",
    [
      {
        org_id: org.id,
        name: "Default bar hiring pack",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const defaultQuestionSet = appQuestionSets[0];
  await maybeInsert(
    "org_application_question_set_items",
    defaultQuestionSet
      ? [
          {
            set_id: defaultQuestionSet.id,
            sort_order: 0,
            question_type: "yes_no",
            prompt: "Are you legally able to work in the UK for the full contract?",
            required: true,
          },
          {
            set_id: defaultQuestionSet.id,
            sort_order: 1,
            question_type: "paragraph",
            prompt: "Describe a time you resolved a conflict in a busy team.",
            required: true,
          },
        ]
      : [],
    "*",
  );

  await maybeInsert(
    "job_listing_panelists",
    liveListing
      ? [
          {
            org_id: org.id,
            job_listing_id: liveListing.id,
            profile_id: byKey(userMap, "james_hann").id,
            assigned_by: byKey(userMap, "sophie_morland").id,
          },
          {
            org_id: org.id,
            job_listing_id: liveListing.id,
            profile_id: byKey(userMap, "aarun_palmer").id,
            assigned_by: byKey(userMap, "sophie_morland").id,
          },
        ]
      : [],
    "*",
  );

  const candidateStages = [
    "applied",
    "screened",
    "assessed",
    "shortlisted",
    "interview_scheduled",
    "checks_cleared",
    "offer_approved",
    "offer_sent",
    "hired",
    "rejected",
  ];
  const applications = await maybeInsert(
    "job_applications",
    liveListing
      ? candidateStages.map((stage, index) => ({
          org_id: org.id,
          job_listing_id: liveListing.id,
          department_id: liveListing.department_id,
          candidate_name: `QA Candidate ${index + 1} ${stage.replace(/_/g, " ")}`,
          candidate_email: `qa.candidate.${index + 1}@camp-site.co.uk`,
          stage,
          portal_token: token(`portal_${stage}`),
          cv_storage_path: index % 2 === 0 ? `qa/cv/${stage}.pdf` : null,
          loom_url: index % 2 === 1 ? `https://www.loom.com/share/qa-${stage}` : null,
          staffsavvy_score: index % 3 === 0 ? Math.min(5, 2 + (index % 4)) : null,
          submitted_at: nowPlus(-10 + index, 10),
        }))
      : [],
    "*",
  );
  const appMap = new Map(applications.map((app) => [app.stage, app]));

  const screenedApp = appMap.get("screened");
  const qLicence = screeningQuestions.find((row) => row.sort_order === 0);
  const qShift = screeningQuestions.find((row) => row.sort_order === 1);
  const screenAnswers = await maybeInsert(
    "job_application_screening_answers",
    screenedApp && qLicence && qShift
      ? [
          {
            org_id: org.id,
            job_application_id: screenedApp.id,
            source_question_id: qLicence.id,
            prompt_snapshot: qLicence.prompt,
            type_snapshot: "yes_no",
            answer_yes_no: true,
          },
          {
            org_id: org.id,
            job_application_id: screenedApp.id,
            source_question_id: qShift.id,
            prompt_snapshot: qShift.prompt,
            type_snapshot: "single_choice",
            options_snapshot: qShift.options,
            answer_choice_id: "18:00",
          },
        ]
      : [],
    "*",
  );
  const firstScreenAnswer = screenAnswers[0];
  await maybeInsert(
    "job_application_screening_scores",
    firstScreenAnswer
      ? [
          {
            org_id: org.id,
            screening_answer_id: firstScreenAnswer.id,
            reviewer_profile_id: byKey(userMap, "sophie_morland").id,
            score: 4,
          },
        ]
      : [],
    "*",
  );

  await maybeInsert(
    "job_application_notes",
    [
      {
        org_id: org.id,
        job_application_id: appMap.get("screened")?.id,
        created_by: byKey(userMap, "sophie_morland").id,
        body: "Good availability, needs right-to-work follow-up.",
      },
      {
        org_id: org.id,
        job_application_id: appMap.get("rejected")?.id,
        created_by: byKey(userMap, "olga_saskova").id,
        body: "Seeded rejection note.",
      },
    ].filter((row) => row.job_application_id),
    "*",
  );

  await maybeInsert(
    "job_application_messages",
    [
      {
        org_id: org.id,
        job_application_id: appMap.get("interview_scheduled")?.id,
        created_by: byKey(userMap, "sophie_morland").id,
        body: "Interview invite — seeded candidate portal message.",
      },
      {
        org_id: org.id,
        job_application_id: appMap.get("offer_sent")?.id,
        created_by: byKey(userMap, "olga_saskova").id,
        body: "Offer update — seeded read candidate message.",
      },
    ].filter((row) => row.job_application_id),
    "*",
  );

  const slots = await maybeInsert(
    "interview_slots",
    liveListing
      ? [
          {
            org_id: org.id,
            job_listing_id: liveListing.id,
            title: "Available bar supervisor interview",
            starts_at: nowPlus(5, 10),
            ends_at: nowPlus(5, 10, 45),
            status: "available",
            created_by: byKey(userMap, "sophie_morland").id,
          },
          {
            org_id: org.id,
            job_listing_id: liveListing.id,
            title: "Booked candidate interview",
            starts_at: nowPlus(8, 14),
            ends_at: nowPlus(8, 14, 45),
            status: "booked",
            created_by: byKey(userMap, "sophie_morland").id,
          },
          {
            org_id: org.id,
            job_listing_id: liveListing.id,
            title: "Completed candidate interview",
            starts_at: nowPlus(-12, 14),
            ends_at: nowPlus(-12, 14, 45),
            status: "completed",
            created_by: byKey(userMap, "sophie_morland").id,
          },
        ]
      : [],
    "*",
  );

  await maybeInsert(
    "interview_slot_panelists",
    slots.flatMap((slot) => [
      {
        slot_id: slot.id,
        profile_id: byKey(userMap, "sophie_morland").id,
      },
      {
        slot_id: slot.id,
        profile_id: byKey(userMap, "olga_saskova").id,
      },
    ]),
    "*",
  );

  const templates = await maybeInsert(
    "offer_letter_templates",
    [
      {
        org_id: org.id,
        name: "Standard hourly offer",
        body_html:
          "<p>Dear {{candidate_name}}, we are pleased to offer you the seeded QA role.</p>",
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const offerTemplate = templates[0];
  const offers = await maybeInsert(
    "application_offers",
    [
      {
        org_id: org.id,
        job_application_id: appMap.get("offer_sent")?.id,
        template_id: offerTemplate?.id,
        body_html: "<p>Seeded offer awaiting candidate signature.</p>",
        portal_token: token("offer_sent"),
        status: "sent",
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        job_application_id: appMap.get("hired")?.id,
        template_id: offerTemplate?.id,
        body_html: "<p>Seeded signed offer.</p>",
        portal_token: token("offer_signed"),
        status: "signed",
        created_by: byKey(userMap, "olga_saskova").id,
        signed_at: nowPlus(-6, 16),
        signer_typed_name: "QA Candidate 9 hired",
      },
      {
        org_id: org.id,
        job_application_id: appMap.get("rejected")?.id,
        template_id: offerTemplate?.id,
        body_html: "<p>Seeded declined offer.</p>",
        portal_token: token("offer_declined"),
        status: "declined",
        created_by: byKey(userMap, "olga_saskova").id,
        declined_at: nowPlus(-12, 10),
      },
    ].filter((row) => row.job_application_id && row.template_id),
    "*",
  );
  const signedOffer = offers.find((offer) => offer.status === "signed");
  const sentOffer = offers.find((offer) => offer.status === "sent");
  const hiredApp = appMap.get("hired");
  const offerSentApp = appMap.get("offer_sent");
  const appliedApp = appMap.get("applied");

  await maybeInsert(
    "recruitment_contract_assignments",
    hiredApp && signedOffer
      ? [
          {
            org_id: org.id,
            job_application_id: hiredApp.id,
            application_offer_id: signedOffer.id,
            assigned_to_user_id: byKey(userMap, "olga_saskova").id,
            contract_signed_on: nowPlus(-6, 16),
            contract_document_url: "https://example.invalid/qa-seed/signed-offer-contract.pdf",
            assigned_by: byKey(userMap, "james_hann").id,
          },
        ]
      : [],
    "*",
  );

  await maybeInsert(
    "hiring_start_readiness",
    [
      hiredApp && signedOffer
        ? {
            org_id: org.id,
            job_application_id: hiredApp.id,
            offer_id: signedOffer.id,
            contract_assigned: true,
            rtw_required: true,
            rtw_complete: true,
            payroll_bank_complete: true,
            payroll_tax_complete: true,
            policy_ack_complete: true,
            it_access_complete: true,
            start_confirmed_at: nowPlus(-5, 10),
            start_confirmed_by: byKey(userMap, "olga_saskova").id,
          }
        : null,
      offerSentApp && sentOffer
        ? {
            org_id: org.id,
            job_application_id: offerSentApp.id,
            offer_id: sentOffer.id,
            contract_assigned: false,
            rtw_required: true,
            rtw_complete: false,
            payroll_bank_complete: false,
            payroll_tax_complete: false,
            policy_ack_complete: true,
            it_access_complete: false,
          }
        : null,
    ].filter(Boolean),
    "*",
  );

  await maybeInsert(
    "onboarding_probation_checkpoints",
    hiredApp
      ? [
          {
            org_id: org.id,
            user_id: byKey(userMap, "darcey_james").id,
            job_application_id: hiredApp.id,
            checkpoint_day: 30,
            due_on: datePlus(20),
            completed_at: nowPlus(-2, 12),
            completed_by: byKey(userMap, "jane_trueman").id,
            note: "30-day probation check-in complete (seed).",
          },
          {
            org_id: org.id,
            user_id: byKey(userMap, "darcey_james").id,
            job_application_id: hiredApp.id,
            checkpoint_day: 60,
            due_on: datePlus(50),
            note: "60-day checkpoint pending (seed).",
          },
        ]
      : [],
    "*",
  );

  const barSupervisorReq = requestMap.get("Bar Shift Supervisor");
  await maybeInsert(
    "recruitment_request_status_events",
    barSupervisorReq
      ? [
          {
            request_id: barSupervisorReq.id,
            org_id: org.id,
            from_status: "pending_review",
            to_status: "approved",
            changed_by: byKey(userMap, "olga_saskova").id,
            note: "Seeded approval audit event (QA).",
          },
        ]
      : [],
    "*",
  );

  if (hiredApp?.id) {
    await maybeUpdate(
      "employee_hr_records",
      { hired_from_application_id: hiredApp.id },
      "user_id",
      byKey(userMap, "darcey_james").id,
    );
  }

  await maybeInsert(
    "recruitment_notifications",
    [
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "olga_saskova").id,
        request_id: requestMap.get("Student Activities Assistant")?.id,
        kind: "new_request",
        old_status: null,
        new_status: "pending_review",
        job_title: "Student Activities Assistant",
        actor_name: "Jane Trueman",
        read_at: null,
      },
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "olga_saskova").id,
        request_id: requestMap.get("HR Systems Analyst")?.id,
        kind: "status_changed",
        old_status: "pending_review",
        new_status: "rejected",
        job_title: "HR Systems Analyst",
        actor_name: "James Hann",
        read_at: nowPlus(-2, 9),
      },
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "olga_saskova").id,
        request_id: requestMap.get("Payroll Assistant (fixed term)")?.id,
        kind: "new_request",
        old_status: null,
        new_status: "pending_review",
        job_title: "Payroll Assistant (fixed term)",
        actor_name: "Aarun Palmer",
        read_at: null,
      },
    ].filter((row) => row.request_id),
    "*",
  );

  await maybeInsert(
    "application_notifications",
    [
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "sophie_morland").id,
        application_id: appliedApp?.id,
        job_listing_id: liveListing?.id,
        kind: "new_submission",
        old_stage: null,
        new_stage: "applied",
        candidate_name: appliedApp?.candidate_name ?? "QA applicant",
        job_title: liveListing?.title ?? "Bar Shift Supervisor",
        actor_name: null,
        read_at: null,
      },
      {
        org_id: org.id,
        recipient_id: byKey(userMap, "olga_saskova").id,
        application_id: offerSentApp?.id,
        job_listing_id: liveListing?.id,
        kind: "stage_changed",
        old_stage: "offer_approved",
        new_stage: "offer_sent",
        candidate_name: offerSentApp?.candidate_name ?? "QA applicant",
        job_title: liveListing?.title ?? "Bar Shift Supervisor",
        actor_name: "Sophie Morland",
        read_at: nowPlus(-1, 13),
      },
    ].filter((row) => row.application_id && row.job_listing_id),
    "*",
  );

  return { requestMap, listingMap, appMap };
}

async function seedOnboardingPerformanceOneOnOnes(org, deptMap, userMap) {
  void deptMap;
  const templates = await maybeInsert(
    "onboarding_templates",
    [
      {
        org_id: org.id,
        name: "New starter core onboarding",
        description: "Core tasks for all seeded new starters.",
        is_default: true,
        is_archived: false,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "Commercial supervisor onboarding",
        description: "Department-specific commercial onboarding.",
        is_default: false,
        is_archived: false,
        created_by: byKey(userMap, "sophie_morland").id,
      },
    ],
    "*",
  );
  const onboardingTemplate = templates[0];

  const templateTasks = await maybeInsert(
    "onboarding_template_tasks",
    onboardingTemplate
      ? [
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            title: "Complete payroll details",
            description: "Submit bank and tax forms.",
            due_offset_days: 1,
            assignee_type: "employee",
            category: "documents",
            sort_order: 10,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            title: "Right-to-work check",
            description: "HR completes compliance check.",
            due_offset_days: 2,
            assignee_type: "hr",
            category: "compliance",
            sort_order: 20,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            title: "Manager welcome chat",
            description: "Line manager books first check-in.",
            due_offset_days: 7,
            assignee_type: "manager",
            category: "introductions",
            sort_order: 30,
          },
        ]
      : [],
    "*",
  );

  const runs = await maybeInsert(
    "onboarding_runs",
    onboardingTemplate
      ? [
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "qa_pending").id,
            employment_start_date: datePlus(7),
            status: "active",
            started_by: byKey(userMap, "olga_saskova").id,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "darcey_james").id,
            employment_start_date: datePlus(-10),
            status: "active",
            started_by: byKey(userMap, "olga_saskova").id,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "timothy_bartlett").id,
            employment_start_date: datePlus(-120),
            status: "completed",
            completed_at: nowPlus(-90, 12),
            started_by: byKey(userMap, "olga_saskova").id,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "qa_inactive").id,
            employment_start_date: datePlus(-300),
            status: "cancelled",
            cancelled_at: nowPlus(-260, 9),
            started_by: byKey(userMap, "olga_saskova").id,
          },
        ]
      : [],
    "*",
  );
  const runForUser = (key) => runs.find((run) => run.user_id === byKey(userMap, key).id) ?? null;
  const qaPendingRun = runForUser("qa_pending");
  const darceyRun = runForUser("darcey_james");
  const timothyRun = runForUser("timothy_bartlett");
  const inactiveRun = runForUser("qa_inactive");

  const onboardingRunTaskRows = [];
  for (let index = 0; index < templateTasks.length; index += 1) {
    const task = templateTasks[index];
    if (qaPendingRun) {
      onboardingRunTaskRows.push({
        org_id: org.id,
        run_id: qaPendingRun.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        assignee_type: task.assignee_type,
        category: task.category,
        due_date: datePlus(1 + index),
        sort_order: task.sort_order,
        status: index === 0 ? "completed" : "pending",
        completed_at: index === 0 ? nowPlus(0, 11) : null,
        completed_by: index === 0 ? byKey(userMap, "qa_pending").id : null,
      });
    }
    if (darceyRun) {
      onboardingRunTaskRows.push({
        org_id: org.id,
        run_id: darceyRun.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        assignee_type: task.assignee_type,
        category: task.category,
        due_date: datePlus(-5 + index),
        sort_order: task.sort_order,
        status: index === 0 ? "completed" : "pending",
        completed_at: index === 0 ? nowPlus(-4, 14) : null,
        completed_by: index === 0 ? byKey(userMap, "darcey_james").id : null,
      });
    }
    if (timothyRun) {
      onboardingRunTaskRows.push({
        org_id: org.id,
        run_id: timothyRun.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        assignee_type: task.assignee_type,
        category: task.category,
        due_date: datePlus(-100 + index),
        sort_order: task.sort_order,
        status: index === 2 ? "skipped" : "completed",
        completed_at: index === 2 ? null : nowPlus(-99 + index, 12),
        completed_by:
          index === 2
            ? null
            : task.assignee_type === "employee"
              ? byKey(userMap, "timothy_bartlett").id
              : byKey(userMap, "olga_saskova").id,
      });
    }
    if (inactiveRun) {
      onboardingRunTaskRows.push({
        org_id: org.id,
        run_id: inactiveRun.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        assignee_type: task.assignee_type,
        category: task.category,
        due_date: datePlus(-280 + index),
        sort_order: task.sort_order,
        status: "pending",
        completed_at: null,
        completed_by: null,
      });
    }
  }

  await maybeInsert("onboarding_run_tasks", onboardingRunTaskRows.filter((row) => row.run_id), "*");

  const cycles = await maybeInsert(
    "review_cycles",
    [
      {
        org_id: org.id,
        name: "2026 Annual Reviews",
        type: "annual",
        status: "active",
        period_start: datePlus(-30),
        period_end: datePlus(120),
        self_assessment_due: datePlus(45),
        manager_assessment_due: datePlus(75),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "Probation Reviews",
        type: "probation",
        status: "draft",
        period_start: datePlus(20),
        period_end: datePlus(80),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "2025 Closed Reviews",
        type: "annual",
        status: "closed",
        period_start: datePlus(-400),
        period_end: datePlus(-340),
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const cycleMap = new Map(cycles.map((cycle) => [cycle.name, cycle]));
  const activeCycle = cycleMap.get("2026 Annual Reviews");
  const closedCycle = cycleMap.get("2025 Closed Reviews");

  const activeReviews = activeCycle
    ? [
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "darcey_james").id,
          reviewer_id: byKey(userMap, "jane_trueman").id,
          status: "pending",
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "isla_thorpe").id,
          reviewer_id: byKey(userMap, "ruby_gislingham").id,
          status: "self_submitted",
          self_assessment: "Seeded self assessment: strong event season, need clearer escalation paths.",
          self_submitted_at: nowPlus(-1, 15),
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "sophie_morland").id,
          reviewer_id: byKey(userMap, "ruby_gislingham").id,
          status: "completed",
          self_assessment: "Delivered late bar training refresh.",
          self_submitted_at: nowPlus(-5, 10),
          manager_assessment: "Consistent duty leadership; continue coaching new supervisors.",
          overall_rating: "strong",
          manager_submitted_at: nowPlus(-4, 10),
          completed_at: nowPlus(-3, 16),
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "sarthak_peshin").id,
          reviewer_id: byKey(userMap, "olga_saskova").id,
          status: "pending",
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "imogen_greene").id,
          reviewer_id: byKey(userMap, "jane_trueman").id,
          status: "self_submitted",
          self_assessment: "Interim cover going well; want clarity on permanent role timeline.",
          self_submitted_at: nowPlus(-2, 16),
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "damien_pearson").id,
          reviewer_id: byKey(userMap, "jane_trueman").id,
          status: "manager_submitted",
          self_assessment: "Society admin workload peaks in welcome week.",
          self_submitted_at: nowPlus(-6, 9),
          manager_assessment: "Strong stakeholder comms; delegate more during peaks.",
          overall_rating: "meets_expectations",
          manager_submitted_at: nowPlus(-5, 11),
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "marcela_gomez_valdes").id,
          reviewer_id: byKey(userMap, "olga_saskova").id,
          status: "cancelled",
        },
        {
          org_id: org.id,
          cycle_id: activeCycle.id,
          reviewee_id: byKey(userMap, "olga_saskova").id,
          reviewer_id: byKey(userMap, "james_hann").id,
          status: "pending",
        },
      ]
    : [];

  const closedReviews =
    closedCycle
      ? [
          {
            org_id: org.id,
            cycle_id: closedCycle.id,
            reviewee_id: byKey(userMap, "timothy_bartlett").id,
            reviewer_id: byKey(userMap, "olga_saskova").id,
            status: "completed",
            self_assessment: "Prior year: supported intranet rollout.",
            self_submitted_at: nowPlus(-380, 10),
            manager_assessment: "Reliable execution under tight deadlines.",
            overall_rating: "meets_expectations",
            manager_submitted_at: nowPlus(-378, 11),
            completed_at: nowPlus(-375, 15),
          },
          {
            org_id: org.id,
            cycle_id: closedCycle.id,
            reviewee_id: byKey(userMap, "aarun_palmer").id,
            reviewer_id: byKey(userMap, "james_hann").id,
            status: "completed",
            self_assessment: "Closed cycle finance leadership summary.",
            self_submitted_at: nowPlus(-390, 9),
            manager_assessment: "Solid financial controls narrative for trustees.",
            overall_rating: "strong",
            manager_submitted_at: nowPlus(-388, 10),
            completed_at: nowPlus(-385, 14),
          },
        ]
      : [];

  const reviews = await maybeInsert("performance_reviews", [...activeReviews, ...closedReviews], "*");
  const reviewByReviewee = new Map(reviews.map((review) => [review.reviewee_id, review]));

  await maybeInsert(
    "review_goals",
    [
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "darcey_james").id)?.id,
        title: "Improve society escalation response time",
        description: "Seeded in-progress goal.",
        status: "in_progress",
        set_by: "employee",
        sort_order: 10,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "isla_thorpe").id)?.id,
        title: "Complete event incident training",
        description: "Seeded not-started goal.",
        status: "not_started",
        set_by: "manager",
        sort_order: 10,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "sophie_morland").id)?.id,
        title: "Launch late bar checklist",
        description: "Seeded completed goal.",
        status: "completed",
        rating: "strong",
        set_by: "employee",
        sort_order: 10,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "sarthak_peshin").id)?.id,
        title: "Build HR metrics dashboard prototype",
        description: "Stretch goal for analytics QA.",
        status: "in_progress",
        set_by: "manager",
        sort_order: 10,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "imogen_greene").id)?.id,
        title: "Document interim handover pack",
        status: "in_progress",
        set_by: "employee",
        sort_order: 20,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "timothy_bartlett").id)?.id,
        title: "Maintain digital support SLAs",
        status: "completed",
        rating: "meets_expectations",
        set_by: "manager",
        sort_order: 10,
      },
      {
        org_id: org.id,
        review_id: reviewByReviewee.get(byKey(userMap, "olga_saskova").id)?.id,
        title: "Embed people analytics in hiring decisions",
        description: "Seeded goal for HR lead review row.",
        status: "not_started",
        set_by: "manager",
        sort_order: 10,
      },
    ].filter((row) => row.review_id),
    "*",
  );

  await maybeUpsert(
    "org_one_on_one_settings",
    {
      org_id: org.id,
      default_cadence_days: 14,
      due_soon_days: 3,
      reminder_offsets_minutes: [1440, 120],
    },
    "org_id",
    "*",
  );

  const oneOnOneTemplates = await maybeInsert(
    "one_on_one_templates",
    [
      {
        org_id: org.id,
        name: "Monthly manager check-in",
        description: "Seeded template with agenda items mapped to structured notes.",
        agenda_items: ["Wins since last time", "Blockers", "Career direction"],
        default_duration_minutes: 45,
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const oneOnOneTemplate = oneOnOneTemplates[0];

  const oooDoc = (managerShared, privateManager) => ({
    version: 1,
    questions: [
      {
        id: "a0000001-0000-4000-8000-000000000099",
        prompt: "QA seed: biggest win since last time?",
        owner: "employee",
        answer: "Shipped the welcome week checklist.",
      },
    ],
    manager_notes_shared: managerShared,
    private_manager_notes: privateManager,
    action_items: [
      { id: "b0000001-0000-4000-8000-000000000001", title: "Share rota draft", owner: "manager", done: false },
    ],
  });

  const meetings = await maybeInsert(
    "one_on_one_meetings",
    oneOnOneTemplate
      ? [
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            manager_user_id: byKey(userMap, "jane_trueman").id,
            report_user_id: byKey(userMap, "darcey_james").id,
            status: "scheduled",
            starts_at: nowPlus(3, 10),
            ends_at: nowPlus(3, 10, 45),
            session_title: "Welcome week debrief",
            shared_notes: "",
            doc: oooDoc("", ""),
            created_by: byKey(userMap, "jane_trueman").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            manager_user_id: byKey(userMap, "ruby_gislingham").id,
            report_user_id: byKey(userMap, "isla_thorpe").id,
            status: "in_progress",
            starts_at: nowPlus(0, 14),
            ends_at: null,
            session_title: "Event season check-in",
            shared_notes: "Discussing cover for Saturday society night.",
            doc: oooDoc("Agreed to trial float steward.", "Watch burnout signals on back-to-back gigs."),
            created_by: byKey(userMap, "ruby_gislingham").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            manager_user_id: byKey(userMap, "ruby_gislingham").id,
            report_user_id: byKey(userMap, "sophie_morland").id,
            status: "completed",
            starts_at: nowPlus(-14, 11),
            ends_at: nowPlus(-14, 11, 50),
            session_title: "Commercial duty sign-off",
            shared_notes: "Signed off late bar checklist and next quarter priorities.",
            doc: oooDoc("Signed off late bar checklist.", ""),
            notes_locked_at: nowPlus(-14, 12),
            completed_at: nowPlus(-14, 12),
            created_by: byKey(userMap, "ruby_gislingham").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            manager_user_id: byKey(userMap, "olga_saskova").id,
            report_user_id: byKey(userMap, "timothy_bartlett").id,
            status: "cancelled",
            starts_at: nowPlus(-5, 10),
            ends_at: nowPlus(-5, 10, 30),
            session_title: "Cancelled HR check-in",
            shared_notes: "",
            doc: oooDoc("", ""),
            created_by: byKey(userMap, "olga_saskova").id,
          },
        ]
      : [],
    "*",
  );
  const meetingMap = new Map(meetings.map((meeting) => [meeting.status, meeting]));

  await maybeInsert(
    "one_on_one_note_edit_requests",
    [
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requester_id: byKey(userMap, "sophie_morland").id,
        status: "pending",
        proposed_notes: "Please update the late bar action wording for clarity.",
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requester_id: byKey(userMap, "ruby_gislingham").id,
        status: "approved",
        proposed_notes: "Approved seeded note edit — tighten checklist language.",
        resolved_by: byKey(userMap, "olga_saskova").id,
        resolved_at: nowPlus(-2, 12),
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requester_id: byKey(userMap, "sophie_morland").id,
        status: "rejected",
        proposed_notes: "Rejected seeded note edit — keep original sign-off wording.",
        resolved_by: byKey(userMap, "olga_saskova").id,
        resolved_at: nowPlus(-1, 12),
      },
    ].filter((row) => row.meeting_id),
    "*",
  );
}

async function seedResourcesReportsPrivacyAdmin(org, deptMap, userMap) {
  void deptMap;
  const folders = await maybeInsert(
    "staff_resource_folders",
    [
      {
        org_id: org.id,
        name: "Policies",
        parent_id: null,
        sort_order: 10,
      },
      {
        org_id: org.id,
        name: "Archived Resources",
        parent_id: null,
        sort_order: 20,
        archived_at: nowPlus(-10, 9),
      },
    ],
    "*",
  );
  const folderMap = new Map(folders.map((folder) => [folder.name, folder]));
  const subfolders = await maybeInsert(
    "staff_resource_folders",
    folderMap.get("Policies")
      ? [
          {
            org_id: org.id,
            name: "Manager Guides",
            parent_id: folderMap.get("Policies").id,
            sort_order: 10,
          },
        ]
      : [],
    "*",
  );
  const managerGuides = subfolders[0];

  await maybeInsert(
    "staff_resources",
    [
      {
        org_id: org.id,
        folder_id: folderMap.get("Policies")?.id,
        title: "Staff handbook",
        description: "Active resource.",
        storage_path: `${org.id}/qa-seed/staff-handbook.pdf`,
        file_name: "staff-handbook.pdf",
        mime_type: "application/pdf",
        byte_size: 102400,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        folder_id: managerGuides?.id,
        title: "Manager escalation playbook",
        description: "Manager guides subtree.",
        storage_path: `${org.id}/qa-seed/manager-playbook.pdf`,
        file_name: "manager-playbook.pdf",
        mime_type: "application/pdf",
        byte_size: 204800,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        folder_id: folderMap.get("Archived Resources")?.id,
        title: "Old rota guide",
        description: "Archived resource.",
        storage_path: `${org.id}/qa-seed/old-rota-guide.pdf`,
        file_name: "old-rota-guide.pdf",
        mime_type: "application/pdf",
        byte_size: 51200,
        archived_at: nowPlus(-7, 9),
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ].filter((row) => row.folder_id),
    "*",
  );

  const reports = await maybeInsert(
    "reports",
    [
      {
        org_id: org.id,
        name: "Broadcast engagement",
        description: "Seeded broadcast read/unread report.",
        domains: ["communications"],
        config: {
          source: "broadcasts",
          metrics: ["sent", "read", "unread"],
        },
        tags: ["seed", "broadcasts"],
        visibility: "org",
        shared_role_keys: [],
        created_by: byKey(userMap, "james_hann").id,
      },
      {
        org_id: org.id,
        name: "Leave liability",
        description: "Finance/HR leave report.",
        domains: ["hr"],
        config: {
          source: "leave_requests",
          metrics: ["used", "pending", "remaining"],
        },
        tags: ["seed", "leave"],
        visibility: "roles",
        shared_role_keys: ["org_admin", "manager"],
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const reportMap = new Map(reports.map((item) => [item.name, item]));

  const reportRuns = await maybeInsert(
    "report_runs",
    [
      {
        org_id: org.id,
        report_id: reportMap.get("Broadcast engagement")?.id,
        run_by: byKey(userMap, "james_hann").id,
        status: "completed",
        row_count: 42,
        result_preview: [{ sent: 3, read: 4, unread: 6 }],
        filters_snapshot: {},
        started_at: nowPlus(-1, 9),
        completed_at: nowPlus(-1, 9, 2),
      },
      {
        org_id: org.id,
        report_id: reportMap.get("Leave liability")?.id,
        run_by: byKey(userMap, "olga_saskova").id,
        status: "failed",
        row_count: 0,
        result_preview: [],
        filters_snapshot: {},
        error_message: "Seeded report failure.",
        started_at: nowPlus(-1, 10),
        completed_at: nowPlus(-1, 10, 1),
      },
      {
        org_id: org.id,
        report_id: reportMap.get("Leave liability")?.id,
        run_by: byKey(userMap, "aarun_palmer").id,
        status: "running",
        row_count: 0,
        result_preview: [],
        filters_snapshot: {},
        started_at: nowPlus(0, 9),
      },
    ].filter((row) => row.report_id),
    "*",
  );
  const reportRunMap = new Map(
    reportRuns.filter((run) => run.status === "completed").map((run) => [run.report_id, run]),
  );

  await maybeInsert(
    "report_schedules",
    [
      {
        org_id: org.id,
        report_id: reportMap.get("Broadcast engagement")?.id,
        recurrence: "weekly",
        cron_expr: null,
        delivery: {
          in_app: true,
          email_org_users: true,
          email_to: ["james.hann@camp-site.co.uk", "tarek.khalil@camp-site.co.uk"],
        },
        is_paused: false,
        next_run_at: nowPlus(7, 8),
        created_by: byKey(userMap, "james_hann").id,
      },
      {
        org_id: org.id,
        report_id: reportMap.get("Leave liability")?.id,
        recurrence: "monthly",
        cron_expr: null,
        delivery: {
          in_app: true,
          email_org_users: false,
        },
        is_paused: true,
        next_run_at: nowPlus(30, 8),
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ].filter((row) => row.report_id),
    "*",
  );

  const broadcastReportId = reportMap.get("Broadcast engagement")?.id;
  const completedBroadcastRun = broadcastReportId
    ? reportRunMap.get(broadcastReportId)
    : null;

  await maybeInsert(
    "report_exports",
    [
      {
        org_id: org.id,
        report_id: broadcastReportId,
        run_id: completedBroadcastRun?.id ?? null,
        exported_by: byKey(userMap, "james_hann").id,
        format: "csv",
        row_count: 42,
      },
      {
        org_id: org.id,
        report_id: reportMap.get("Leave liability")?.id,
        run_id: null,
        exported_by: byKey(userMap, "olga_saskova").id,
        format: "pdf",
        row_count: 0,
      },
    ].filter((row) => row.report_id),
    "*",
  );

  await maybeInsert(
    "user_pinned_reports",
    [
      {
        user_id: byKey(userMap, "james_hann").id,
        report_id: reportMap.get("Broadcast engagement")?.id,
      },
      {
        user_id: byKey(userMap, "olga_saskova").id,
        report_id: reportMap.get("Leave liability")?.id,
      },
    ].filter((row) => row.report_id),
    "*",
  );

  await maybeInsert(
    "privacy_retention_policies",
    [
      {
        org_id: org.id,
        domain: "recruitment",
        retention_days: 365,
        legal_basis: "Legitimate interests (HR and recruitment operations).",
        action: "anonymize",
        is_active: true,
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        domain: "broadcasts",
        retention_days: 2555,
        legal_basis: "Operational communications retention (seed).",
        action: "delete",
        is_active: false,
        created_by: byKey(userMap, "james_hann").id,
      },
    ],
    "*",
  );

  const erasures = await maybeInsert(
    "privacy_erasure_requests",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "qa_inactive").id,
        requester_user_id: byKey(userMap, "olga_saskova").id,
        request_reason: "Seeded inactive staff erasure request.",
        status: "legal_review",
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "timothy_bartlett").id,
        requester_user_id: byKey(userMap, "olga_saskova").id,
        request_reason: "Seeded rejected erasure request.",
        status: "rejected",
        review_note: "Seeded legal hold — rejected by review.",
      },
    ],
    "*",
  );

  await maybeInsert(
    "privacy_erasure_audit_events",
    erasures.flatMap((erasure) => [
      {
        org_id: org.id,
        erasure_request_id: erasure.id,
        user_id: erasure.user_id,
        actor_user_id: byKey(userMap, "olga_saskova").id,
        event_type: "requested",
        payload: {
          source: "system_qa_seed",
        },
      },
      {
        org_id: org.id,
        erasure_request_id: erasure.id,
        user_id: erasure.user_id,
        actor_user_id: byKey(userMap, "james_hann").id,
        event_type: erasure.status === "rejected" ? "rejected" : "reviewed",
        payload: {
          outcome: erasure.status,
        },
      },
    ]),
    "*",
  );

  await maybeInsert(
    "discount_tiers",
    [
      {
        org_id: org.id,
        role: "coordinator",
        label: "QA coordinator tier",
        discount_value: "10%",
        valid_at: "All week",
      },
      {
        org_id: org.id,
        role: "manager",
        label: "QA manager tier",
        discount_value: "25%",
        valid_at: "Weekdays",
      },
      {
        org_id: org.id,
        role: "weekly_paid",
        label: "QA weekly paid tier",
        discount_value: "15%",
        valid_at: "All week",
      },
    ],
    "*",
  );

  const qrTokens = await maybeInsert(
    "staff_qr_tokens",
    [
      {
        user_id: byKey(userMap, "sophie_morland").id,
        token_hash: token("qr_hash"),
        issued_reason: "manual",
        expires_at: nowPlus(30, 9),
      },
      {
        user_id: byKey(userMap, "qa_inactive").id,
        token_hash: token("qr_expired"),
        issued_reason: "manual",
        expires_at: nowPlus(-1, 9),
      },
    ],
    "*",
  );

  await maybeInsert(
    "scan_logs",
    (qrTokens.length
      ? [
          {
            org_id: org.id,
            scanner_id: byKey(userMap, "sophie_morland").id,
            scanned_user_id: qrTokens[0]?.user_id,
            token_valid: true,
            scanned_display_name: "Sophie Morland",
            discount_label_snapshot: "QA coordinator tier",
          },
          {
            org_id: org.id,
            scanner_id: byKey(userMap, "sophie_morland").id,
            scanned_user_id: qrTokens[1]?.user_id,
            token_valid: false,
            error_code: "expired",
            scanned_display_name: "QA Inactive",
          },
        ]
      : []
    ).filter((row) => row.scanned_user_id),
    "*",
  );

  await maybeInsert(
    "discount_verify_buckets",
    [
      {
        org_id: org.id,
        bucket_start: nowPlus(0, 0),
        hits: 3,
      },
      {
        org_id: org.id,
        bucket_start: nowPlus(0, 1),
        hits: 28,
      },
    ],
    "*",
  );

  await maybeInsert(
    "google_connections",
    [
      {
        user_id: byKey(userMap, "james_hann").id,
        type: "calendar",
        access_token: "seed-placeholder-calendar-access",
        refresh_token: "seed-placeholder-calendar-refresh",
        expires_at: nowPlus(1, 9),
        google_email: "james.hann@camp-site.co.uk",
      },
      {
        user_id: byKey(userMap, "james_hann").id,
        type: "sheets",
        access_token: "seed-placeholder-sheets-access",
        refresh_token: "seed-placeholder-sheets-refresh",
        expires_at: nowPlus(1, 10),
        spreadsheet_id: "seed-spreadsheet-id",
        sheet_name: "RotaImport",
        google_email: "james.hann@camp-site.co.uk",
      },
      {
        user_id: byKey(userMap, "olga_saskova").id,
        type: "calendar",
        access_token: "seed-expired-calendar-access",
        refresh_token: "seed-expired-calendar-refresh",
        expires_at: nowPlus(-1, 9),
        google_email: "olga.saskova@camp-site.co.uk",
      },
    ],
    "*",
  );

  await maybeInsert(
    "sheets_mappings",
    [
      {
        org_id: org.id,
        sheet_name: "Payroll",
        header_row: 1,
        col_name: "A",
        col_date: "B",
        col_start: "C",
        col_end: "D",
        col_dept: "E",
        col_role: "F",
      },
      {
        org_id: org.id,
        sheet_name: "HR",
        header_row: 2,
        col_name: "A",
        col_date: "B",
        col_start: "C",
        col_end: "D",
        col_dept: "E",
        col_role: "F",
      },
    ],
    "*",
  );

  await maybeInsert(
    "notifications",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "james_hann").id,
        actor_id: byKey(userMap, "olga_saskova").id,
        type: "privacy",
        title: "Erasure request needs review",
        body: "Seeded unread privacy/admin notification.",
        read_at: null,
        entity_type: "privacy_erasure_request",
        entity_id: erasures[0]?.id,
      },
      {
        org_id: org.id,
        user_id: byKey(userMap, "aarun_palmer").id,
        actor_id: byKey(userMap, "sophie_morland").id,
        type: "payroll",
        title: "Wagesheet batch in review",
        body: "Seeded read finance notification.",
        read_at: nowPlus(-1, 10),
        entity_type: "payroll_wagesheet_review",
        entity_id: null,
      },
    ].filter((row) => row.entity_id || row.type === "payroll"),
    "*",
  );
}

function printPlan() {
  log(`System QA seed plan for ${ORG_NAME} (${ORG_SLUG})\n`);
  for (const feature of featurePlan) {
    log(`- ${feature}`);
  }
  log("\nLogin accounts that will be reused/created:");
  for (const persona of personas) {
    log(`- ${persona.email} (${persona.role}, ${persona.status})`);
  }
  log(
    "\nExisting @camp-site.co.uk passwords are preserved unless CAMPSITE_SYSTEM_QA_RESET_PASSWORDS=1 is set.",
  );
  log(
    "Profiles are made active in this org by default so login lands in the QA data. Set CAMPSITE_SYSTEM_QA_ACTIVATE_PROFILES=0 to only add memberships.",
  );
  log(
    `If this org slug already exists: npm run seed-system-qa:continue  (or pass --continue). Or set CAMPSITE_SYSTEM_QA_ORG_SLUG to seed a different org.`,
  );
}

async function main() {
  printPlan();
  if (PLAN_ONLY) return;

  await runStep("Creating/finding QA organisation", async () => {
    report.org = await ensureOrganisation();
  });

  const org = report.org;
  const foundation = await runStep("Seeding org foundation", async () => {
    return seedOrgFoundation(org);
  });

  const broadcastState = await runStep("Seeding broadcasts and notifications", async () => {
    return seedBroadcasts(
      org,
      foundation.deptMap,
      foundation.userMap,
      foundation.teamMap,
    );
  });

  await runStep("Seeding calendar, rota-adjacent, attendance, payroll, leave", async () => {
    return seedCalendarAttendanceLeavePayroll(
      org,
      foundation.deptMap,
      foundation.userMap,
      broadcastState.broadcastMap,
    );
  });

  await runStep("Seeding HR records", async () => {
    return seedHr(org, foundation.deptMap, foundation.userMap);
  });

  await runStep("Seeding hiring and candidate portal states", async () => {
    return seedHiring(org, foundation.deptMap, foundation.userMap);
  });

  await runStep("Seeding onboarding, performance, and one-on-ones", async () => {
    return seedOnboardingPerformanceOneOnOnes(
      org,
      foundation.deptMap,
      foundation.userMap,
    );
  });

  await runStep("Seeding resources, reports, privacy, admin, and integrations", async () => {
    return seedResourcesReportsPrivacyAdmin(org, foundation.deptMap, foundation.userMap);
  });

  const outputPath = "scripts/system-qa-seed-output.json";
  writeFileSync(`${process.cwd()}/${outputPath}`, `${JSON.stringify(report, null, 2)}\n`);

  log("\nSystem QA seed complete.");
  log(`Output manifest: ${outputPath}`);
  log(`Org: ${ORG_NAME} (${ORG_SLUG})`);
  log(
    RESET_EXISTING_PASSWORDS
      ? `Existing user passwords were reset to CAMPSITE_SYSTEM_QA_PASSWORD/CAMPSITE_USSU_PASSWORD.`
      : "Existing @camp-site.co.uk passwords were preserved.",
  );
  if (report.warnings.length) {
    log(`Warnings/skipped optional tables: ${report.warnings.length}`);
  }
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}`);
  process.exit(1);
});
