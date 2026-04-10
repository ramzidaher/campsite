# Recruitment Candidate Portal Blueprint

## Objective

Convert the static recruitment HTML references into production React/TSX pages that integrate with the existing Supabase-backed recruitment pipeline and org tenancy model.

---

## Phase 0 & 1 — Verification audit (complete)

| Area | Status |
|------|--------|
| Blueprint: section matrix, HR routes, public routes, tenant helpers | Documented below |
| Public job board `/jobs` | Org-scoped RPCs, summary, dept tabs, contract chips, pagination, `?org=` on links |
| Job detail `/jobs/[slug]` | `public_job_listing_by_slug`, back link to listing with tenant helper |
| Middleware | `isPublicPath` includes `/jobs` tree |
| Typecheck / migrations pushed | CI-local |

---

## Phase 2 — Candidate identity & auth (complete)

| Deliverable | Implementation |
|-------------|----------------|
| Separate candidate identity | [`candidate_profiles`](../../supabase/migrations/20260620120000_candidate_portal_auth_and_public_listings.sql); [`job_applications.candidate_user_id`](../../supabase/migrations/20260620120000_candidate_portal_auth_and_public_listings.sql) |
| Auto-provision profile on signup | Trigger [`handle_new_candidate_profile`](../../supabase/migrations/20260620140000_candidate_profile_auth_trigger.sql) on `auth.users` (skips staff `register_org_id` path) |
| Register / login / forgot | [`/jobs/register`](../apps/web/src/app/(public)/jobs/register/page.tsx), [`/jobs/login`](../apps/web/src/app/(public)/jobs/login/page.tsx), [`/jobs/forgot-password`](../apps/web/src/app/(public)/jobs/forgot-password/page.tsx); forms set `account_type: 'candidate'` on sign up |
| Tenant links between auth screens | Server reads `org` query + `x-campsite-org-slug`; [`tenantJobsSubrouteRelativePath`](../apps/web/src/lib/tenant/adminUrl.ts) on client forms |
| Auth boundary | [`middleware.ts`](../apps/web/src/middleware.ts): `account_type === 'candidate'` → allowed only `/jobs`, `/auth/*`, `/`; staff `/login` and `/register` redirect to `/jobs/me` for logged-in candidates |
| Login redirect when anonymous | [`buildCandidateJobsLoginRedirectUrl`](../apps/web/src/lib/jobs/candidateAuthRedirect.ts) on [`/jobs/me`](../apps/web/src/app/(public)/jobs/me/page.tsx) |
| Self-service RPC | [`get_my_candidate_applications()`](../../supabase/migrations/20260620120000_candidate_portal_auth_and_public_listings.sql) (`auth.uid()` only) |

**Phase 2 verification:** Candidate routes and middleware behave as documented; `account_type: candidate` on signup; DB trigger creates `candidate_profiles` when not on staff registration path. **Note:** `submit_job_application` was further hardened in Phase 3 (uses `auth.uid()` only — see below).

---

## Phase 3 — Application submission & attachments (complete)

| Deliverable | Implementation |
|-------------|----------------|
| Trusted candidate linkage | [`submit_job_application`](../../supabase/migrations/20260620150000_phase3_submit_application_security_and_cover_letter.sql) sets `candidate_user_id` from **`auth.uid()`** only; enforces **email matches** `auth.users` when signed in (no forged UUID param). |
| Cover letter | Column `job_applications.cover_letter`; passed as `p_cover_letter` from server action. |
| CV validation | [`cvUploadConstraints.ts`](../apps/web/src/lib/recruitment/cvUploadConstraints.ts) — max 5 MB, PDF/Word; validated **before** RPC on server; client file picker validates before continue. |
| Upload failure UX | Server action appends a clear message if storage upload fails after application row exists. |
| Apply UI | [`ApplyJobFormClient`](../apps/web/src/app/(public)/jobs/[slug]/apply/ApplyJobFormClient.tsx): guest vs signed-in banner, email readonly when authenticated, sign-in link with `next` back to apply, hidden `cover_letter` submit. |
| Tests | [`cvUploadConstraints.test.ts`](../apps/web/src/lib/recruitment/__tests__/cvUploadConstraints.test.ts) |

**Phase 3 verification:** Migration [`20260620150000_phase3_submit_application_security_and_cover_letter.sql`](../../supabase/migrations/20260620150000_phase3_submit_application_security_and_cover_letter.sql) wires `candidate_user_id` from `auth.uid()`, enforces email match when signed in, and persists `cover_letter`; apply [`actions.ts`](../apps/web/src/app/(public)/jobs/[slug]/apply/actions.ts) passes `p_cover_letter` and validates CV via [`cvUploadConstraints`](../apps/web/src/lib/recruitment/cvUploadConstraints.ts).

---

## Phase 4 — Candidate portal (track status, history, profile) (complete)

| Deliverable | Implementation |
|-------------|----------------|
| Application list polish | [`/jobs/me`](../apps/web/src/app/(public)/jobs/me/page.tsx) — status chips ([`CandidateApplicationStageBadge`](../apps/web/src/app/(public)/jobs/me/CandidateApplicationStageBadge.tsx)), links to detail + token tracker |
| Authenticated application detail | [`get_my_candidate_application_detail`](../../supabase/migrations/20260620160000_phase4_candidate_application_detail_rpc.sql) — same payload as token portal for `candidate_user_id = auth.uid()`; page [`/jobs/me/[applicationId]`](../apps/web/src/app/(public)/jobs/me/[applicationId]/page.tsx) — messages, joining instructions, synthetic **Progress** timeline ([`applicationStageTimeline`](../apps/web/src/lib/jobs/applicationStageTimeline.ts), [`ApplicationStageTimeline`](../apps/web/src/app/(public)/jobs/me/ApplicationStageTimeline.tsx)) |
| Shared HR messages UI | [`CandidateApplicationMessages`](../apps/web/src/app/(public)/jobs/me/CandidateApplicationMessages.tsx) used by detail + [`/jobs/status/[token]`](../apps/web/src/app/(public)/jobs/status/[token]/page.tsx) |
| Candidate profile | [`/jobs/me/profile`](../apps/web/src/app/(public)/jobs/me/profile/page.tsx) — [`candidate_profiles`](../supabase/migrations/20260620120000_candidate_portal_auth_and_public_listings.sql) upsert via [`actions.ts`](../apps/web/src/app/(public)/jobs/me/profile/actions.ts) |
| Portal navigation | [`CandidatePortalNav`](../apps/web/src/app/(public)/jobs/CandidatePortalNav.tsx); jobs board adds Profile tab; [`tenantJobsSubrouteRelativePath('me/profile')`](../apps/web/src/lib/tenant/adminUrl.ts), [`tenantJobMeApplicationRelativePath`](../apps/web/src/lib/tenant/adminUrl.ts) |

**Phase 4 verification:** Routes [`/jobs/me`](../apps/web/src/app/(public)/jobs/me/page.tsx), [`/jobs/me/[applicationId]`](../apps/web/src/app/(public)/jobs/me/[applicationId]/page.tsx), [`/jobs/me/profile`](../apps/web/src/app/(public)/jobs/me/profile/page.tsx) exist; RPC [`get_my_candidate_application_detail`](../../supabase/migrations/20260620160000_phase4_candidate_application_detail_rpc.sql) is granted to `authenticated`; shared components [`CandidateApplicationStageBadge`](../apps/web/src/app/(public)/jobs/me/CandidateApplicationStageBadge.tsx) / [`CandidateApplicationMessages`](../apps/web/src/app/(public)/jobs/me/CandidateApplicationMessages.tsx) are referenced from the status tracker.

---

## Phase 5 — HR publishing, org linking, and public funnel metrics (complete)

| Deliverable | Implementation |
|-------------|----------------|
| `published_at` when going live | Trigger [`job_listings_ensure_published_at`](../../supabase/migrations/20260620121000_hr_job_publishing_hardening.sql) sets `published_at` if null when `status = 'live'`. |
| Public funnel events | Table [`job_listing_public_metrics`](../../supabase/migrations/20260620121000_hr_job_publishing_hardening.sql); RPC [`track_public_job_metric`](../../supabase/migrations/20260620121000_hr_job_publishing_hardening.sql) — wired from job detail ([`[slug]/page.tsx`](../apps/web/src/app/(public)/jobs/[slug]/page.tsx)), apply ([`apply/page.tsx`](../apps/web/src/app/(public)/jobs/[slug]/apply/page.tsx), [`apply/actions.ts`](../apps/web/src/app/(public)/jobs/[slug]/apply/actions.ts)) for `impression`, `apply_start`, `apply_submit`. |
| Metrics storage hardening | RLS enabled on `job_listing_public_metrics`; HR reads via [`get_job_listing_public_metrics_summary`](../../supabase/migrations/20260620170000_phase5_job_metrics_rls_and_hr_summary.sql) (`jobs.edit` + org match). |
| HR UI | [`AdminJobEditClient`](../apps/web/src/components/admin/AdminJobEditClient.tsx) “Public careers funnel” strip when listing is **live**; data loaded in [`admin/jobs/[id]/edit/page.tsx`](../apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx) (shared by HR re-export). |
| Org context for public careers | Tenant host + `?org=` → [`resolveHostRequestContext`](../apps/web/src/lib/middleware/resolveHostRequestContext.ts) / `x-campsite-org-slug` (middleware); public RPCs require matching active org slug. |

**Phase 5 verification:** Apply [`npm run supabase:db:push`](../../package.json) so [`20260620121000_hr_job_publishing_hardening.sql`](../../supabase/migrations/20260620121000_hr_job_publishing_hardening.sql) and [`20260620170000_phase5_job_metrics_rls_and_hr_summary.sql`](../../supabase/migrations/20260620170000_phase5_job_metrics_rls_and_hr_summary.sql) are applied. Open a **live** job in HR/admin edit and confirm the **Public careers funnel** strip shows counts after visiting the public job URL and apply flow.

---

## Phase 6 — Quality, security review, and rollout (complete)

| Area | Implementation / notes |
|------|-------------------------|
| Typecheck / CI | Run `npm run typecheck` at repo root before merge. |
| Unit tests | [`cvUploadConstraints.test.ts`](../apps/web/src/lib/recruitment/__tests__/cvUploadConstraints.test.ts); [`applicationStageTimeline.test.ts`](../apps/web/src/lib/jobs/__tests__/applicationStageTimeline.test.ts) — run `npm test` in `apps/web`. |
| Application spam / abuse | DB throttling for `submit_job_application` via [`job_application_rate_limit_events`](../../supabase/migrations/20260618170000_phase7_cleanup_rate_limit_and_integrity.sql) (rolling window). |
| Candidate trust boundaries | Signed-in apply: [`submit_job_application`](../../supabase/migrations/20260620150000_phase3_submit_application_security_and_cover_letter.sql) uses `auth.uid()` and email match; candidate RPCs (`get_my_candidate_*`) scoped to `auth.uid()`. |
| Public metrics | [`job_listing_public_metrics`](../../supabase/migrations/20260620121000_hr_job_publishing_hardening.sql) RLS + HR-only read RPC [`get_job_listing_public_metrics_summary`](../../supabase/migrations/20260620170000_phase5_job_metrics_rls_and_hr_summary.sql). Funnel events are best-effort (server-side `track_public_job_metric`); expect noise from bots and staff previews — copy on HR edit screen states this. |
| Environment | `NEXT_PUBLIC_SUPABASE_URL` and a publishable anon key; tenant host config via existing app env (see `getTenantRootDomain` / middleware org resolution). |
| Pre-launch QA | Run the **Phase 1 — Manual verification checklist** (below) on a tenant with at least one live listing; smoke-test candidate register → apply → `/jobs/me` → `/jobs/status/[token]`. |
| Candidate vs staff | [`middleware.ts`](../apps/web/src/middleware.ts): `account_type === 'candidate'` restricted to `/jobs` tree + auth routes (see Phase 2 table). |

---

## Phase 0 — Section → component matrix (complete)

### `campsite_careers_portal.html`

| Mock section | Production implementation | Notes |
|--------------|---------------------------|--------|
| Global styles (Inter / DM Serif) | App fonts via `globals.css` / `font-authSerif` | CampSite design system, not Google Fonts import in page |
| Login view (`#view-login`) | [`/jobs/login`](../apps/web/src/app/(public)/jobs/login/page.tsx) | Email/password; OAuth buttons from mock not implemented |
| Magic link / forgot (`#view-magic`, `#view-magic-sent`) | [`/jobs/forgot-password`](../apps/web/src/app/(public)/jobs/forgot-password/page.tsx) | Supabase reset email flow |
| Logged-in top bar (`top-bar`, brand, user chip, sign out) | [`CareersSessionStrip`](../apps/web/src/app/(public)/jobs/CareersSessionStrip.tsx) | Shows session email + sign out, or sign in/register |
| Nav tabs (`Open roles` / `My applications`) | [`/jobs` page nav](../apps/web/src/app/(public)/jobs/page.tsx) | Links to `/jobs` and `/jobs/me`; `?org=` preserved via helpers |
| Board header (`board-title`, `board-meta` “X positions across Y departments”) | Same page header + [`public_job_listings_org_summary`](../../supabase/migrations/20260620130000_public_jobs_summary_and_departments.sql) | Live counts from DB |
| Search row (`search-input` + filter chips) | Search `GET` form + contract chip links | Mock “Remote” / “Fast hire” **not** in schema — omitted (see out of scope) |
| Department tabs (`dept-tabs`, “All teams” + departments) | Team pills + [`public_job_listing_department_names`](../../supabase/migrations/20260620130000_public_jobs_summary_and_departments.sql) | Distinct `departments.name` for live listings |
| Job cards (`job-card`, dept, tags, footer, apply) | Listing cards on `/jobs` | Includes **org name** on each card, contract/grade/salary pills, posted date |
| Job list container (`#job-list`) | Paginated grid | [`public_job_listings`](../../supabase/migrations/20260620120000_candidate_portal_auth_and_public_listings.sql), page size 12 |
| Status panel (`#panel-status`, timelines) | [`/jobs/me`](../apps/web/src/app/(public)/jobs/me/page.tsx) + [`/jobs/me/[applicationId]`](../apps/web/src/app/(public)/jobs/me/[applicationId]/page.tsx) + [`/jobs/status/[token]`](../apps/web/src/app/(public)/jobs/status/[token]/page.tsx) | List + signed-in detail + token portal |

### `campsite_careers_register.html`

| Mock section | Production route |
|--------------|------------------|
| Register / sign in chrome | `/jobs/register`, `/jobs/login` |

### `campsite_job_application_portal.html`

| Mock section | Production |
|--------------|------------|
| Multi-step apply | [`ApplyJobFormClient`](../apps/web/src/app/(public)/jobs/[slug]/apply/ApplyJobFormClient.tsx) |
| Tracker copy | Apply success + `/jobs/status/...` |

---

## HR / admin route map (staff — not candidate)

Jobs and pipeline remain under authenticated `(main)` routes (org context + RBAC):

| Area | App Router path |
|------|-------------------|
| Admin job list | `apps/web/src/app/(main)/admin/jobs/page.tsx` |
| Admin job edit | `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx` |
| Admin applications pipeline | `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx` |
| HR job list | `apps/web/src/app/(main)/hr/jobs/page.tsx` |
| HR job edit | `apps/web/src/app/(main)/hr/jobs/[id]/edit/page.tsx` |
| HR applications | `apps/web/src/app/(main)/hr/jobs/[id]/applications/page.tsx` |

Candidate-facing URLs must **not** assume access to these; middleware blocks `account_type: candidate` from staff areas.

---

## Public / candidate route map

| Path | Purpose |
|------|---------|
| `/jobs` | Org-scoped job board (requires tenant host or `?org=`). |
| `/jobs/[slug]` | Job detail. |
| `/jobs/[slug]/apply` | Application form. |
| `/jobs/login`, `/jobs/register`, `/jobs/forgot-password` | Candidate auth. |
| `/jobs/me` | Authenticated application list. |
| `/jobs/me/[applicationId]` | Signed-in application detail (messages, timeline, links). |
| `/jobs/me/profile` | Candidate profile (name, contact links). |
| `/jobs/status/[token]` | Token-based tracker (email link). |

---

## Tenant URL helpers

- [`tenantPublicJobsIndexRelativePath`](../apps/web/src/lib/tenant/adminUrl.ts) — `/jobs` with `?org=` when needed.
- [`tenantJobsSubrouteRelativePath`](../apps/web/src/lib/tenant/adminUrl.ts) — `/jobs/login`, `/jobs/me`, etc.
- [`buildPublicJobsHref`](../apps/web/src/app/(public)/jobs/buildPublicJobsHref.ts) — listing filters with org preservation.

---

## Data boundaries

- Single Supabase project; org scoping via `x-campsite-org-slug` / `?org=`.
- Public reads via security definer RPCs: `status = 'live'`, organisation active, slug match.
- Candidate data: `candidate_profiles`, `job_applications.candidate_user_id`, `get_my_candidate_applications()`.

---

## Mock features intentionally out of scope (Phase 1)

- **Google / LinkedIn OAuth** on login mock — not wired (Supabase providers can be enabled later).
- **Remote / Fast hire filter chips** — no `remote` / `fast_hire` fields on `job_listings`; contract + department + search cover real data.
- **Location filter** — no `location` column on listings; search still matches advert copy for place names if HR paste them into copy.

---

## Phase 1 — Manual verification checklist

Run on a tenant with at least one **live** job (and `?org=slug` if not using org subdomain):

| # | Case | Expected |
|---|------|----------|
| 1 | Open `/jobs` (or `?org=` ) | Board loads; summary line matches DB counts. |
| 2 | Wrong/missing org context | 404 (`notFound`). |
| 3 | Search keyword | Filters listing; `org` preserved when not on subdomain. |
| 4 | Team pill “All teams” vs specific department | `dept` query matches `departments.name` exactly. |
| 5 | Contract chips | Filters by `contract_type`. |
| 6 | Pagination | Next/prev retains `q`, `dept`, `contract`, `org`. |
| 7 | Job card | Shows org name, title, dept, contract, grade, salary, posted date. |
| 8 | Click job → detail | [`[slug]/page.tsx`](../apps/web/src/app/(public)/jobs/[slug]/page.tsx); “Back to open roles” returns to listing with correct `org`. |
| 9 | Unpublished / draft job | Detail 404 via RPC. |
| 10 | Nav “My applications” | Goes to `/jobs/me` (login if anonymous). |

---

## UI parity rules

- Serif headings (`font-authSerif`), neutral surfaces, green primary CTA (`#008B60`), compact meta labels.
- Keyboard: interactive elements are links/buttons with visible focus via browser defaults; search field has `aria-label`.
- Responsive: board grid `md:grid-cols-2`; tabs wrap.
