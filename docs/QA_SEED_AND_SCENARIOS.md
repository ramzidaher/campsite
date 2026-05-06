# QA seed data and manual test scenarios

This guide pairs **`npm run seed-qa-full`** with a structured walkthrough of major product areas. Use a **local or staging** Supabase project; the seed uses **`example.com`** emails (no real inbox).

**Related:** [`PERMISSIONS.md`](../PERMISSIONS.md) (RBAC model), [`RBAC_SECURITY_REVIEW.md`](RBAC_SECURITY_REVIEW.md).

---

## Prerequisites

1. Apply DB migrations: `npm run supabase:db:push`
2. Root `.env`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service_role JWT), `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)
3. Run: `npm run seed-qa-full`
4. Start app: `npm run dev` (from repo root or `apps/web`)

If the org slug already exists, delete the organisation in Supabase **or** set `CAMPSITE_QA_ORG_SLUG` to a new value before re-seeding.

After seeding, open **`scripts/qa-seed-output.json`** (gitignored) for UUIDs. There are **many** staff accounts; the table below lists the ones most useful for scenarios.

---

## Default QA credentials

**Password for every account** (override with `CAMPSITE_QA_PASSWORD`):

`CampSiteQA2026!`

Emails follow **`campsite-qa-{key-with-hyphens}@example.com`** (e.g. `jane_trueman` → `campsite-qa-jane-trueman@example.com`).

| Persona | Email | Profile role | Notes |
|--------|-------|--------------|--------|
| Org admin (fixture) | `campsite-qa-orgadmin@example.com` | org_admin | Full `/admin`, HR, recruitment, RBAC; also in **Senior Leadership** |
| Activities manager | `campsite-qa-jane-trueman@example.com` | manager | **Activities**; approver for broadcasts; seeded draft author |
| Staff / IC (Activities) | `campsite-qa-darcey-james@example.com` | coordinator | **Reports to** Jane; same dept as pending applicant |
| Events coordinator | `campsite-qa-isla-thorpe@example.com` | coordinator | **Events** (isolation vs Activities) |
| Student Engagement admin | `campsite-qa-marcela-gomez-valdes@example.com` | administrator | Broadcaster-style perms tests |
| Bar / duty | `campsite-qa-sophie-morland@example.com` | duty_manager | **Commercial** |
| Pending applicant | `campsite-qa-pending@example.com` | unassigned | **pending**; in **Activities** for manager approval |
| Society leader | `campsite-qa-society-lead@example.com` | society_leader | **Demo Society** |

**Organisation:** slug `campsite-qa-lab`, name `CampSite QA Lab`.

**Pre-seeded org structure (illustrative SU-style):**

- **Departments:** Activities, Student Voice, Student Participation, Events, Student Engagement, Communications & Digital Support, Commercial, Finance, HR, Senior Leadership, plus **Demo Society** (society type).
- **Staff:** full-time list seeded from the QA script (names/titles mirror a typical students’ union directory  see `scripts/seed-qa-full.mjs`).
- **Reporting lines:** CEO (**James Hann**) at top; SLT and department heads report to CEO; others report to their department head where applicable.
- **Team:** “Staff Team” under **Activities** (Jane lead; Darcey + Imogen members).
- **HR records (sample):** Jane, Darcey, Isla.
- **Broadcast:** draft in **Activities** / channel **Announcements**, created by Jane.

**Department merge:** Org admins (or holders of `departments.manage`) can open **Admin → Departments**, edit a department, and use **Merge department** at the bottom of the panel to combine it into another department (channels and teams with the same name are merged).

---

## How to log in

1. Open `/login` on your app URL.
2. Enter **email + password** from the table (Magic Link / SSO optional if configured).
3. You should land on the home/dashboard for the active org (`profiles.org_id` is set by seed).

**Platform founder / HQ:** not created by this seed. To test founder-only flows: `npm run add-platform-founder` (see script header) with a dedicated email, then sign in as that user.

**Larger role matrix (18 users):** `npm run seed-demo-org`  random email tags per run; good for scale/abac edge cases. This QA seed is **deterministic** but includes a **large** staff roster.

---

## Scenario checklist by feature

For each block: sign in as the suggested user(s), confirm navigation and core action. Server-side denials should match [`PERMISSIONS.md`](../PERMISSIONS.md).

### Auth & shell

| Scenario | User | Expect |
|----------|------|--------|
| Login / logout | any | Session works; logout returns to login |
| Wrong password | any | Rejected |
| Nav visible by role | orgadmin vs manager vs csa | Admin sees `/admin/*`; non–org-admin does not see full admin (permission-based shell items) |

### Admin  core

| Scenario | User | Expect |
|----------|------|--------|
| Admin overview | orgadmin | `/admin` loads |
| System overview graph | orgadmin | `/admin/system-overview` (permission bundle) |
| All members | orgadmin | List, filters; edit roles if `members.edit_roles` |
| Pending approval | orgadmin, Jane | Pending user visible; approve/reject |
| Roles & permissions | orgadmin | `roles.view`; create custom only with `roles.manage` |
| Departments | orgadmin | CRUD / archive; **merge** two departments via edit panel |
| Teams (department teams) | orgadmin, Jane | Teams UI; **Staff Team** under Activities |
| Categories / channels | orgadmin | Broadcast channels per dept |

### Admin  content & ops

| Scenario | User | Expect |
|----------|------|--------|
| Broadcasts (admin) | orgadmin, Jane, Marcela | List; seeded **draft** exists; workflow draft → approval → send per org rules |
| Rota management | orgadmin | Create schedule / shifts (if enabled for org) |
| Recruitment (admin links) | orgadmin | `/hr/recruitment` and related HR routes from admin nav |

### Manager workspace

| Scenario | User | Expect |
|----------|------|--------|
| Manager landing | Jane | `/manager` (or linked hubs per `manager` layout) |
| Teams / departments scoped | Jane vs Isla | Only scoped depts/teammates |
| System overview (scoped) | manager with graph perms | `/manager/system-overview` if permitted |

### HR

| Scenario | User | Expect |
|----------|------|--------|
| Employee records | orgadmin | Full directory + records |
| Employee records (scoped) | Jane | Records for visible members (dept + hierarchy rules) |
| HR dashboard / directory | orgadmin | Metrics and rows |
| Org chart | orgadmin, users with `hr.view_records` | `/hr/org-chart`  live `reports_to` tree |
| Leave | Darcey, Jane | Submit leave; manager approves direct reports |
| Performance | Jane, Darcey | Cycles/reviews per seeded org (create cycle in UI if empty) |
| Onboarding | orgadmin | Templates / runs; staff completes assigned tasks |

### Reports

| Scenario | User | Expect |
|----------|------|--------|
| Saved sample reports | org admin or anyone with `reports.view` | After **`npm run seed-qa-full`**, `/reports` lists three org-visible **Sample:** reports (active employees, staff directory, time & pay). Use **Run** for preview rows and CSV / Excel / PDF export. |
| Minimal local org (`demo` slug) | user in that org | After **`supabase db reset`** (applies `supabase/seed.sql`), the same fixtures load when at least one **profile** exists for the demo org. Fixture JSON lives at `apps/web/src/lib/reports/fixtures/report-seed-fixtures.json`  keep it in sync with `seed.sql` if you edit columns. |

### Recruitment pipeline

| Scenario | User | Expect |
|----------|------|--------|
| Recruitment requests | orgadmin | Create / approve request per permissions |
| Job listings | orgadmin | Create listing after approved request (DB FK chain) |
| Applications | orgadmin | Pipeline screens |
| Offers / interviews | orgadmin | Scheduling and PDF flows if configured |

*Listing seed is not automated* (requires `recruitment_requests`). Use org admin to create the minimum chain once, then regression-test listing and portal.

### Staff  day-to-day

| Scenario | User | Expect |
|----------|------|--------|
| Dashboard / home | csa | Staff home loads |
| Broadcasts feed | Darcey | See org/dept broadcasts; read tracking |
| Calendar | any | Events / rota integrations per product |
| Profile / settings | any | Name, avatar, org if multi-tenant |
| Discounts / staff QR | Sophie, Jane | Verify flow if feature flags on |
| Pending approvals (standalone page) | Jane | `/pending-approvals` if `approvals.members.review` |

### RBAC & isolation (from Phase work)

| Scenario | Users | Expect |
|----------|-------|--------|
| Dept isolation | Isla vs Jane | Events user does **not** see Activities-only profiles/data in scoped lists |
| Assign role ceiling | Jane | Cannot assign role above own rank (API/RPC error) |
| Custom role builder | orgadmin with `roles.manage` | `/admin` roles → create custom; picker capped |
| Permission overrides | Jane → Darcey | Edit member → overrides panel for **report** only |
| Org chart edges | orgadmin | Correct `reports_to`; masked manager if viewer cannot see manager profile |

---

## Regression: security-sensitive flows

1. **Pending user:** Sign in as **Jane** → approve **campsite-qa-pending@example.com** with a role allowed by `list_assignable_org_roles` / RPC.
2. **Subordinate-only overrides:** As manager, confirm you **cannot** open overrides for **Isla** (peer in another dept / not a report).
3. **Invite (known gap):** See [RBAC_SECURITY_REVIEW.md](RBAC_SECURITY_REVIEW.md)  invite path uses service RPC; validate inviter intent separately if `members.invite` is broad.

---

## Troubleshooting

| Issue | Check |
|--------|------|
| Empty admin permissions | Org insert should have fired `ensure_org_rbac_bootstrap`; verify `org_roles` / `user_org_role_assignments` for org |
| Cannot log in | `email_confirm: true` via seed; correct `NEXT_PUBLIC_SUPABASE_URL` in app `.env` |
| Duplicate slug | Change `CAMPSITE_QA_ORG_SLUG` or delete org |
| HR / broadcast insert failed | Run latest migrations; read script stderr for FK / RLS (service role should bypass RLS) |
| Merge fails | Run migrations including `merge_org_departments`; caller needs org admin or `departments.manage` |

---

## Scripts summary

| Command | Purpose |
|---------|---------|
| `npm run seed-qa-full` | **This doc**  deterministic QA org, SU-style departments + ~45 staff, HR sample + draft broadcast + team + **three sample saved reports** for `/reports` |
| `node scripts/generate-qa-login-csv.mjs` | Writes gitignored `scripts/qa-login-import.csv`  logins for local and production `/login` (uses `CAMPSITE_QA_PASSWORD` or seed default). |
| `npm run seed-demo-org` | 18 users, random emails, department overlap lab |
| `npm run create-super-admin` | Initial org admin / bootstrap |
| `npm run add-platform-founder` | Platform founder for HQ / founder-only catalog |
