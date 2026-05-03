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
  "Broadcasts: org-wide, department, team targeted, mandatory, pinned, draft, pending approval, scheduled, cancelled, sent, read, unread, replies, and subscriptions.",
  "Notifications: read and unread notification rows across broadcast, leave, hiring, and application workflows where schemas are present.",
  "Calendar and rota-adjacent states: manual, rota, and broadcast events with attendee response states.",
  "Attendance and payroll: work sites, clock-in/out events, submitted/approved/rejected/draft timesheets, wagesheet lines, adjustments, and review rows where available.",
  "Leave and absence: allowances, pending, approved, rejected, cancelled leave, sickness episodes, TOIL credit requests, in-app leave notifications, and org leave-year settings.",
  "HR records: employee records, contract/pay states, documents/categories, training, bank/tax approval states, medical notes, dependants, employment history, and custom fields where available.",
  "Hiring: recruitment requests, job listings, applications across the candidate pipeline, interviews, notes, messages, offer templates, offers, and portal tokens.",
  "Onboarding: templates, template tasks, active/completed/cancelled runs, and pending/completed/skipped run tasks.",
  "Performance: review cycles, reviews, goals, development actions, and multiple completion states.",
  "One-on-ones: settings, templates, scheduled/in-progress/completed/cancelled meetings, actions, shared/private notes, and note edit approvals.",
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
    role: "manager",
    status: "active",
    department: "HR",
    title: "HR Manager",
  },
  {
    key: "sarthak_peshin",
    fullName: "Sarthak Peshin",
    email: "sarthak.peshin@camp-site.co.uk",
    role: "coordinator",
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
        `Organisation '${ORG_SLUG}' already exists. Re-run with --continue to add data to it.`,
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
    const row = await maybeUpsert(
      "departments",
      {
        org_id: org.id,
        name: department.name,
        description: department.description,
        type: department.type,
        is_archived: department.is_archived ?? false,
      },
      "org_id,name",
      "*",
    );
    if (row) {
      deptMap.set(department.name, row);
      report.departments.push({
        id: row.id,
        name: row.name,
        type: row.type,
        is_archived: row.is_archived,
      });
    }
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
      department_id: department.id,
      avatar_url: null,
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
        department_id: department.id,
      },
      "user_id,org_id",
      "*",
    );

    await maybeUpsert(
      "user_departments",
      {
        user_id: auth.id,
        dept_id: department.id,
        role:
          persona.role === "manager" ||
          persona.role === "org_admin" ||
          persona.role === "duty_manager"
            ? "manager"
            : persona.role === "society_leader"
              ? "society_leader"
              : "member",
        active: persona.status === "active",
      },
      "user_id,dept_id",
      "*",
    );

    if (
      persona.role === "org_admin" ||
      persona.role === "manager" ||
      persona.role === "duty_manager"
    ) {
      await maybeUpsert(
        "dept_managers",
        {
          dept_id: department.id,
          user_id: auth.id,
          role: persona.role === "org_admin" ? "owner" : "manager",
        },
        "dept_id,user_id",
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
        description: "Visible team targeting and rota adjacency.",
        lead_user_id: byKey(userMap, "jane_trueman").id,
      },
      {
        dept_id: byKey(deptMap, "Events").id,
        name: "Event Duty Team",
        description: "Duty manager and coordinator QA team.",
        lead_user_id: byKey(userMap, "ruby_gislingham").id,
      },
      {
        dept_id: byKey(deptMap, "Commercial").id,
        name: "Late Bar Team",
        description: "Attendance, payroll, and shift QA team.",
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
        role: key === "jane_trueman" ? "lead" : "member",
      });
    }
  }
  for (const key of ["ruby_gislingham", "isla_thorpe"]) {
    const team = teamMap.get("Event Duty Team");
    if (team) {
      teamMemberRows.push({
        team_id: team.id,
        user_id: byKey(userMap, key).id,
        role: key === "ruby_gislingham" ? "lead" : "member",
      });
    }
  }
  for (const key of ["sophie_morland", "qa_inactive"]) {
    const team = teamMap.get("Late Bar Team");
    if (team) {
      teamMemberRows.push({
        team_id: team.id,
        user_id: byKey(userMap, key).id,
        role: key === "sophie_morland" ? "lead" : "member",
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
      ui_mode: "dark",
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
      ui_mode: "light",
    },
    "id",
    byKey(userMap, "timothy_bartlett").id,
  );

  return { deptMap, userMap, teamMap };
}

async function seedBroadcasts(org, deptMap, userMap, teamMap) {
  const channelRows = await maybeInsert(
    "broadcast_channels",
    [
      {
        dept_id: byKey(deptMap, "Senior Leadership").id,
        name: "Leadership Announcements",
      },
      {
        dept_id: byKey(deptMap, "HR").id,
        name: "HR Policy Updates",
      },
      {
        dept_id: byKey(deptMap, "Activities").id,
        name: "Activities Ops",
      },
      {
        dept_id: byKey(deptMap, "Events").id,
        name: "Events Ops",
      },
      {
        dept_id: byKey(deptMap, "Commercial").id,
        name: "Commercial Ops",
      },
    ],
    "*",
  );
  const channelMap = new Map(channelRows.map((channel) => [channel.name, channel]));

  const activityChannel = channelMap.get("Activities Ops");
  const eventsChannel = channelMap.get("Events Ops");
  const commercialChannel = channelMap.get("Commercial Ops");
  const hrChannel = channelMap.get("HR Policy Updates");
  const leadershipChannel = channelMap.get("Leadership Announcements");

  await maybeInsert(
    "user_subscriptions",
    [
      {
        user_id: byKey(userMap, "darcey_james").id,
        channel_id: activityChannel?.id,
        subscribed: true,
      },
      {
        user_id: byKey(userMap, "imogen_greene").id,
        channel_id: activityChannel?.id,
        subscribed: false,
      },
      {
        user_id: byKey(userMap, "isla_thorpe").id,
        channel_id: eventsChannel?.id,
        subscribed: true,
      },
    ].filter((row) => row.channel_id),
    "*",
  );

  const broadcasts = await maybeInsert(
    "broadcasts",
    [
      {
        org_id: org.id,
        created_by: byKey(userMap, "james_hann").id,
        channel_id: leadershipChannel?.id ?? null,
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
        created_by: byKey(userMap, "ruby_gislingham").id,
        channel_id: eventsChannel?.id ?? null,
        team_id: teamMap.get("Event Duty Team")?.id ?? null,
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
        created_by: byKey(userMap, "timothy_bartlett").id,
        channel_id: commercialChannel?.id ?? null,
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
        created_by: byKey(userMap, "james_hann").id,
        channel_id: leadershipChannel?.id ?? null,
        team_id: null,
        title: "Cancelled leadership update",
        body: "Cancelled post for historical/cancelled UI state.",
        status: "cancelled",
        is_org_wide: true,
        is_mandatory: false,
        is_pinned: false,
      },
    ],
    "*",
  );
  const broadcastMap = new Map(broadcasts.map((broadcast) => [broadcast.title, broadcast]));

  const mandatory = broadcastMap.get("Mandatory org update - read receipt required");
  const unread = broadcastMap.get("Unread activities handover");
  const teamTargeted = broadcastMap.get("Team targeted event cover note");
  await maybeInsert(
    "broadcast_reads",
    [
      {
        broadcast_id: mandatory?.id,
        user_id: byKey(userMap, "james_hann").id,
        read_at: nowPlus(-4, 12),
      },
      {
        broadcast_id: mandatory?.id,
        user_id: byKey(userMap, "olga_saskova").id,
        read_at: nowPlus(-3, 9),
      },
      {
        broadcast_id: unread?.id,
        user_id: byKey(userMap, "jane_trueman").id,
        read_at: nowPlus(-2, 15),
      },
      {
        broadcast_id: teamTargeted?.id,
        user_id: byKey(userMap, "ruby_gislingham").id,
        read_at: nowPlus(-1, 10),
      },
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

  const hrRecords = [];
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
    hrRecords.push({
      org_id: org.id,
      user_id: user.id,
      job_title: persona.title,
      grade_level: "Seeded",
      contract_type: contractType,
      salary_band: salaryBand,
      fte: persona.role === "duty_manager" ? 0.8 : 1.0,
      work_location: persona.department === "Communications & Digital Support" ? "remote" : "hybrid",
      employment_start_date: datePlus(persona.status === "inactive" ? -700 : -220),
      probation_end_date: datePlus(persona.status === "inactive" ? -500 : 60),
      created_by: byKey(userMap, "olga_saskova").id,
    });
  }
  const insertedHrRecords = await maybeInsert("employee_hr_records", hrRecords, "*");
  const hrByUser = new Map(insertedHrRecords.map((record) => [record.user_id, record]));

  await maybeInsert(
    "employee_hr_documents",
    [
      {
        org_id: org.id,
        user_id: byKey(userMap, "darcey_james").id,
        category: "right_to_work",
        label: "Right to work evidence",
        storage_path: `${org.id}/qa-seed/darcey/right-to-work.pdf`,
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
        storage_path: `${org.id}/qa-seed/olga/contract.pdf`,
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
        storage_path: `${org.id}/qa-seed/timothy/training.pdf`,
        file_name: "training.pdf",
        mime_type: "application/pdf",
        byte_size: 51200,
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
        encrypted_payload: QA_SEED_ENCRYPTED_PLACEHOLDER,
        tax_code_masked: "1257L",
        tax_code_last2: "7L",
        submitted_by: byKey(userMap, "darcey_james").id,
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
        created_by: byKey(userMap, "jane_trueman").id,
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
  const liveListing = listingMap.get("Bar Shift Supervisor");
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
  await maybeInsert(
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

  const appliedApp = appMap.get("applied");
  const offerSentApp = appMap.get("offer_sent");

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
  const templates = await maybeInsert(
    "onboarding_templates",
    [
      {
        org_id: org.id,
        name: "New starter core onboarding",
        description: "Core tasks for all seeded new starters.",
        department_id: null,
        created_by: byKey(userMap, "olga_saskova").id,
        active: true,
      },
      {
        org_id: org.id,
        name: "Commercial supervisor onboarding",
        description: "Department-specific commercial onboarding.",
        department_id: byKey(deptMap, "Commercial").id,
        created_by: byKey(userMap, "sophie_morland").id,
        active: true,
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
            assignee_role: "employee",
            sort_order: 10,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            title: "Right-to-work check",
            description: "HR completes compliance check.",
            due_offset_days: 2,
            assignee_role: "hr",
            sort_order: 20,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            title: "Manager welcome chat",
            description: "Line manager books first check-in.",
            due_offset_days: 7,
            assignee_role: "manager",
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
            manager_id: byKey(userMap, "jane_trueman").id,
            status: "active",
            start_date: datePlus(0),
            created_by: byKey(userMap, "olga_saskova").id,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "timothy_bartlett").id,
            manager_id: byKey(userMap, "olga_saskova").id,
            status: "completed",
            start_date: datePlus(-120),
            completed_at: nowPlus(-90, 12),
            created_by: byKey(userMap, "olga_saskova").id,
          },
          {
            org_id: org.id,
            template_id: onboardingTemplate.id,
            user_id: byKey(userMap, "qa_inactive").id,
            manager_id: byKey(userMap, "sophie_morland").id,
            status: "cancelled",
            start_date: datePlus(-300),
            cancelled_at: nowPlus(-260, 9),
            created_by: byKey(userMap, "olga_saskova").id,
          },
        ]
      : [],
    "*",
  );
  const runMap = new Map(runs.map((run) => [run.status, run]));

  await maybeInsert(
    "onboarding_run_tasks",
    templateTasks.flatMap((task, index) => [
      {
        org_id: org.id,
        run_id: runMap.get("active")?.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        status: index === 0 ? "completed" : "pending",
        due_at: nowPlus(index + 1, 9),
        completed_at: index === 0 ? nowPlus(0, 11) : null,
        assigned_to:
          task.assignee_role === "employee"
            ? byKey(userMap, "qa_pending").id
            : byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        run_id: runMap.get("completed")?.id,
        template_task_id: task.id,
        title: task.title,
        description: task.description,
        status: index === 2 ? "skipped" : "completed",
        due_at: nowPlus(-100 + index, 9),
        completed_at: index === 2 ? null : nowPlus(-99 + index, 12),
        assigned_to:
          task.assignee_role === "employee"
            ? byKey(userMap, "timothy_bartlett").id
            : byKey(userMap, "olga_saskova").id,
      },
    ]).filter((row) => row.run_id),
    "*",
  );

  const cycles = await maybeInsert(
    "review_cycles",
    [
      {
        org_id: org.id,
        name: "2026 Annual Reviews",
        cycle_type: "annual",
        status: "active",
        starts_at: datePlus(-10),
        ends_at: datePlus(50),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "Probation Reviews",
        cycle_type: "probation",
        status: "draft",
        starts_at: datePlus(20),
        ends_at: datePlus(80),
        created_by: byKey(userMap, "olga_saskova").id,
      },
      {
        org_id: org.id,
        name: "2025 Closed Reviews",
        cycle_type: "annual",
        status: "closed",
        starts_at: datePlus(-400),
        ends_at: datePlus(-340),
        created_by: byKey(userMap, "olga_saskova").id,
      },
    ],
    "*",
  );
  const cycleMap = new Map(cycles.map((cycle) => [cycle.name, cycle]));
  const activeCycle = cycleMap.get("2026 Annual Reviews");

  const reviews = await maybeInsert(
    "performance_reviews",
    activeCycle
      ? [
          {
            org_id: org.id,
            review_cycle_id: activeCycle.id,
            employee_id: byKey(userMap, "darcey_james").id,
            manager_id: byKey(userMap, "jane_trueman").id,
            status: "pending",
            due_at: datePlus(21),
          },
          {
            org_id: org.id,
            review_cycle_id: activeCycle.id,
            employee_id: byKey(userMap, "isla_thorpe").id,
            manager_id: byKey(userMap, "ruby_gislingham").id,
            status: "self_submitted",
            due_at: datePlus(15),
            self_submitted_at: nowPlus(-1, 15),
            self_summary: "Seeded self review summary.",
          },
          {
            org_id: org.id,
            review_cycle_id: activeCycle.id,
            employee_id: byKey(userMap, "sophie_morland").id,
            manager_id: byKey(userMap, "ruby_gislingham").id,
            status: "completed",
            due_at: datePlus(-3),
            self_submitted_at: nowPlus(-5, 10),
            manager_submitted_at: nowPlus(-4, 10),
            completed_at: nowPlus(-3, 16),
            manager_summary: "Seeded completed review summary.",
          },
        ]
      : [],
    "*",
  );
  const reviewByEmployee = new Map(reviews.map((review) => [review.employee_id, review]));

  await maybeInsert(
    "review_goals",
    [
      {
        org_id: org.id,
        review_id: reviewByEmployee.get(byKey(userMap, "darcey_james").id)?.id,
        title: "Improve society escalation response time",
        description: "Seeded in-progress goal.",
        status: "in_progress",
        due_at: datePlus(60),
      },
      {
        org_id: org.id,
        review_id: reviewByEmployee.get(byKey(userMap, "isla_thorpe").id)?.id,
        title: "Complete event incident training",
        description: "Seeded not-started goal.",
        status: "not_started",
        due_at: datePlus(45),
      },
      {
        org_id: org.id,
        review_id: reviewByEmployee.get(byKey(userMap, "sophie_morland").id)?.id,
        title: "Launch late bar checklist",
        description: "Seeded completed goal.",
        status: "completed",
        due_at: datePlus(-5),
        completed_at: nowPlus(-7, 12),
      },
    ].filter((row) => row.review_id),
    "*",
  );

  await maybeInsert(
    "performance_development_actions",
    [
      {
        org_id: org.id,
        review_id: reviewByEmployee.get(byKey(userMap, "darcey_james").id)?.id,
        owner_id: byKey(userMap, "darcey_james").id,
        title: "Shadow HR on complex society case",
        status: "open",
        due_at: datePlus(30),
      },
      {
        org_id: org.id,
        review_id: reviewByEmployee.get(byKey(userMap, "sophie_morland").id)?.id,
        owner_id: byKey(userMap, "sophie_morland").id,
        title: "Complete supervisor coaching",
        status: "done",
        due_at: datePlus(-10),
        completed_at: nowPlus(-12, 13),
      },
    ].filter((row) => row.review_id),
    "*",
  );

  await maybeUpsert(
    "org_one_on_one_settings",
    {
      org_id: org.id,
      default_frequency: "monthly",
      reminder_days_before: 2,
      allow_employee_private_notes: true,
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
        description: "Seeded template with prompts.",
        created_by: byKey(userMap, "olga_saskova").id,
        active: true,
      },
    ],
    "*",
  );
  const oneOnOneTemplate = oneOnOneTemplates[0];
  await maybeInsert(
    "one_on_one_template_prompts",
    oneOnOneTemplate
      ? [
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            prompt: "What is going well?",
            sort_order: 10,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            prompt: "Where do you need support?",
            sort_order: 20,
          },
        ]
      : [],
    "*",
  );

  const meetings = await maybeInsert(
    "one_on_one_meetings",
    oneOnOneTemplate
      ? [
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            employee_id: byKey(userMap, "darcey_james").id,
            manager_id: byKey(userMap, "jane_trueman").id,
            status: "scheduled",
            scheduled_at: nowPlus(3, 10),
            created_by: byKey(userMap, "jane_trueman").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            employee_id: byKey(userMap, "isla_thorpe").id,
            manager_id: byKey(userMap, "ruby_gislingham").id,
            status: "in_progress",
            scheduled_at: nowPlus(0, 14),
            started_at: nowPlus(0, 14),
            created_by: byKey(userMap, "ruby_gislingham").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            employee_id: byKey(userMap, "sophie_morland").id,
            manager_id: byKey(userMap, "ruby_gislingham").id,
            status: "completed",
            scheduled_at: nowPlus(-14, 11),
            started_at: nowPlus(-14, 11),
            completed_at: nowPlus(-14, 12),
            created_by: byKey(userMap, "ruby_gislingham").id,
          },
          {
            org_id: org.id,
            template_id: oneOnOneTemplate.id,
            employee_id: byKey(userMap, "timothy_bartlett").id,
            manager_id: byKey(userMap, "olga_saskova").id,
            status: "cancelled",
            scheduled_at: nowPlus(-5, 10),
            cancelled_at: nowPlus(-6, 9),
            created_by: byKey(userMap, "olga_saskova").id,
          },
        ]
      : [],
    "*",
  );
  const meetingMap = new Map(meetings.map((meeting) => [meeting.status, meeting]));

  await maybeInsert(
    "one_on_one_notes",
    [
      {
        org_id: org.id,
        meeting_id: meetingMap.get("in_progress")?.id,
        author_id: byKey(userMap, "isla_thorpe").id,
        body: "Private seeded employee note.",
        visibility: "private",
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        author_id: byKey(userMap, "ruby_gislingham").id,
        body: "Shared seeded manager note.",
        visibility: "shared",
      },
    ].filter((row) => row.meeting_id),
    "*",
  );

  await maybeInsert(
    "one_on_one_actions",
    [
      {
        org_id: org.id,
        meeting_id: meetingMap.get("scheduled")?.id,
        owner_id: byKey(userMap, "darcey_james").id,
        title: "Bring welcome week cover plan",
        status: "open",
        due_at: datePlus(3),
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        owner_id: byKey(userMap, "sophie_morland").id,
        title: "Share late-bar checklist",
        status: "done",
        due_at: datePlus(-8),
        completed_at: nowPlus(-9, 12),
      },
    ].filter((row) => row.meeting_id),
    "*",
  );

  await maybeInsert(
    "one_on_one_note_edit_requests",
    [
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requested_by: byKey(userMap, "sophie_morland").id,
        status: "pending",
        requested_body: "Please update the action wording.",
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requested_by: byKey(userMap, "ruby_gislingham").id,
        status: "approved",
        requested_body: "Approved seeded note edit.",
        decided_by: byKey(userMap, "olga_saskova").id,
        decided_at: nowPlus(-2, 12),
      },
      {
        org_id: org.id,
        meeting_id: meetingMap.get("completed")?.id,
        requested_by: byKey(userMap, "darcey_james").id,
        status: "rejected",
        requested_body: "Rejected seeded note edit.",
        decided_by: byKey(userMap, "olga_saskova").id,
        decided_at: nowPlus(-1, 12),
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
