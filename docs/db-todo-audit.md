# Database Audit – Actionable TODO List

## 🏗️ Phase 0 – Migration Safety (Do This Before Touching Anything)

> **⚠️ Many of the ALTER TABLE commands in later phases will take an `AccessExclusiveLock` and block all reads/writes on a live system. Follow these patterns for every migration.**

- [ ] Always add new columns as `NULL` first — never add a `NOT NULL` column with no default in a single step
- [ ] Backfill data in batches (e.g., `UPDATE ... WHERE id BETWEEN x AND y`) rather than a single full-table update
- [ ] For `NOT NULL` columns: backfill first, then `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` — note that `VALIDATE CONSTRAINT` applies to CHECK and FK constraints only, not `NOT NULL`; use `NOT VALID` / `VALIDATE CONSTRAINT` for any new CHECK or FK constraints to avoid holding a full table lock during validation
- [ ] Create indexes using `CREATE INDEX CONCURRENTLY` — avoids table locks entirely
- [ ] Drop columns in two steps: first stop writing to the column in application code, then drop it in a later deploy
- [ ] Test every migration on a production-size data clone before running on live — never assume a migration that was fast in dev will be fast in prod

---

## 🚨 Phase 1 – Critical Security & Integrity Fixes

- [ ] Remove all plaintext token columns (`portal_token` on `job_applications` and `application_offers`) — use only the existing `portal_token_hash` columns for lookups
- [ ] Ensure OAuth tokens are encrypted before insertion — `google_connections.access_token` and `refresh_token` must never be stored in plaintext (application/KMS level)
- [ ] Review `DEFAULT auth.uid()` on `created_by` / `updated_by` columns per table (`employee_hr_records`, `recruitment_requests`, `review_cycles`, `onboarding_templates`, `sickness_absences`) — these silently store NULL when writes come from service roles or migration scripts; audit each table's write paths and remove the default on any table that is written to outside a user session context
- [ ] Conduct a row-level access review for every table storing PII — verify RLS policies exist, are correctly scoped by `org_id`, and are not bypassed by service role connections; tables requiring immediate review: `employee_hr_records`, `employee_bank_details`, `employee_uk_tax_details`, `employee_medical_notes`, `google_connections`, `candidate_profiles`
- [ ] Enforce strict Row Level Security (RLS) on all remaining tenant-scoped tables not yet covered
- [ ] Add composite unique keys `(org_id, id)` on parent tables that are referenced by tenant-scoped children — the purpose is to allow composite FK references from child tables, not to add new uniqueness (since `id` is already the PK); skip tables that are intentionally global (e.g., `permission_catalog`)
- [ ] Add composite `(org_id, FK_column)` foreign key references on tenant-scoped child tables — this prevents a row in Org A from referencing an entity belonging to Org B; apply selectively to tables that carry `org_id` and reference a parent that also carries `org_id`; do not force this on references to global/shared tables
- [ ] Review and explicitly define `ON DELETE` behaviour for every foreign key — currently all default silently to `NO ACTION`, which blocks `privacy_erasure_requests` at the database level
- [ ] Set `FILLFACTOR 80` specifically on tables with frequent in-place updates: `employee_hr_records`, notification read-state tables, and any counter/status tables — do not apply broadly; tables that are mostly append-only gain nothing and waste space:
  ```sql
  ALTER TABLE public.employee_hr_records SET (fillfactor = 80);
  ```

---

## ⚠️ Phase 2 – Data Integrity Enforcement

**Unique org-scoped business keys (new — these are silent collision points even when PKs are fine):**
- [ ] Enforce unique slugs/keys per org on user-facing identifiers:
  - [ ] `organisations.slug` — globally unique
  - [ ] `job_listings.slug` scoped to `org_id`
  - [ ] `org_roles.key` scoped to `org_id`
  - [ ] `hr_custom_field_definitions.key` scoped to `org_id`
  - [ ] `broadcast_channels` name scoped to `org_id` (verify business rule)
  - [ ] `staff_resource_folders` name scoped to parent folder / org (verify business rule)

**Singleton table protection:**
- [ ] Enforce one-row-per-org on settings tables that are logically singleton:
  - [ ] `org_attendance_settings` — add `UNIQUE (org_id)` or use `org_id` as PK
  - [ ] `org_leave_settings` — same
  - [ ] `org_hr_metric_settings` — same
  - [ ] `platform_legal_settings` already uses `CHECK (id = 1)` — verify this is sufficient or replace with a proper guard

**Duplicate active-record prevention:**
- [ ] Audit all "current state with history" tables for exactly-one-active-row guarantees:
  - [ ] `employee_bank_details (org_id, user_id) WHERE is_active = true`
  - [ ] `employee_uk_tax_details (org_id, user_id) WHERE is_active = true`
  - [ ] `employee_medical_notes` — determine if there is a "current" concept and enforce it
  - [ ] `leave_allowances (org_id, user_id, leave_year)` — one allowance row per user per year
  - [ ] `one_on_one_pair_settings (org_id, manager_user_id, report_user_id)` — one settings row per pair
  - [ ] `weekly_timesheets (org_id, user_id, week_start_date)` — one timesheet per user per week

**Chronological constraints:**
- [ ] Add `end >= start` (or `end > start` where zero-duration is invalid) constraints on all time-based tables: `leave_requests`, `rota_shifts`, `interview_slots`, `one_on_one_meetings`, `calendar_events`, `sickness_absences`, `weekly_timesheets`, `org_leave_holiday_periods`

**Status/timestamp consistency:**
- [ ] Add conditional CHECK constraints ensuring workflow status and timestamps agree:
  - [ ] `status = 'signed'` → `signed_at IS NOT NULL AND signer_typed_name IS NOT NULL`
  - [ ] `status = 'declined'` → `declined_at IS NOT NULL`
  - [ ] `status = 'approved'` → `decided_at IS NOT NULL AND decided_by IS NOT NULL`
  - [ ] `status = 'pending_edit'` → `proposed_start_date IS NOT NULL AND proposed_end_date IS NOT NULL`
  - [ ] Cancelled/archived states should be mutually exclusive with active flags

**Other uniqueness:**
- [ ] Add uniqueness constraints on:
  - [ ] `(event_id, profile_id)` for `calendar_event_attendees`
  - [ ] `(org_id, manager_user_id, report_user_id)` for `one_on_one_pair_settings`
  - [ ] `(org_id, user_id, leave_year)` for `leave_allowances`
  - [ ] `(org_id, user_id, definition_id)` for `hr_custom_field_values`
  - [ ] `(org_id, user_id, week_start_date)` for `weekly_timesheets`
  - [ ] `(user_id, type)` for `google_connections`

**Email normalisation (treat as high priority — obvious collision point across multiple tables):**
- [ ] Apply `citext` extension or lower-case unique indexes to all email columns: `profiles.email`, `user_org_memberships.email`, `job_applications.candidate_email`, `google_connections.google_email` — case-sensitive duplicates silently accumulate otherwise

**Other integrity:**
- [ ] Add trigger to maintain `search_tsv` on UPDATE of `title`/`body` on `broadcasts` and `staff_resources` — column DEFAULT only fires on INSERT, leaving the search index stale after any update
- [ ] Fix `discount_tiers.discount_value` and `valid_at` — change from `text` to `numeric` and `daterange` respectively
- [ ] Identify the hottest multi-table write flows (leave approval, rota assignment, HR record updates) and standardise their table access order in application code to prevent circular wait deadlocks — this is an application-layer concern that cannot be enforced by the schema, but the paths must be explicitly documented
- [ ] Add optimistic locking to core mutable records (`employee_hr_records`, `leave_requests`, `application_offers`) — prevents lost updates without holding row locks:
  ```sql
  ALTER TABLE public.employee_hr_records ADD COLUMN version integer NOT NULL DEFAULT 1;
  -- Application layer: UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2
  -- If 0 rows updated, another process won the race — retry or surface conflict to user
  ```

---

## ⚡ Phase 3 – Performance & Indexing

- [ ] Add indexes on all foreign key columns
- [ ] Add composite indexes for high-traffic queries:
  - [ ] `(org_id, user_id)` on `employee_hr_records`
  - [ ] `(org_id, status)` on `leave_requests`, `job_applications`, `job_listings`
  - [ ] `(org_id, start_date, end_date)` on `leave_requests`
  - [ ] `(user_id, clocked_at DESC)` and `(org_id, clocked_at DESC)` on `attendance_events`
  - [ ] `(org_id, user_id, start_date)` on `sickness_absences`
  - [ ] `(org_id, start_time)` and `(user_id, start_time, end_time)` on `rota_shifts`
  - [ ] `(recipient_id, read_at)` on all notification tables
- [ ] Add partial indexes for:
  - [ ] Unread notifications (`read_at IS NULL`)
  - [ ] Unprocessed jobs (`processed_at IS NULL`)
  - [ ] Active/current records (e.g., `status = 'live'` on `job_listings`)
  - [ ] Pending requests on `leave_requests`
- [ ] Add GIN indexes for:
  - [ ] `tsvector` search columns (`broadcasts.search_tsv`, `staff_resources.search_tsv`)
  - [ ] JSONB fields queried for specific keys (e.g., `employee_case_records.linked_documents`)
  - [ ] ARRAY fields used in filters (e.g., `candidate_profiles.skills`)
- [ ] Optimise job/queue tables:
  - [ ] Add polling indexes on `created_at WHERE processed_at IS NULL` for all `*_notification_jobs` tables
  - [ ] Ensure workers use `FOR UPDATE SKIP LOCKED`
  - [ ] Add deduplication constraints (enforce `dedupe_key` uniqueness on `hr_metric_notifications`)

---

## 📈 Phase 4 – Scalability & Growth

> **⚠️ Only partition tables that are realistically approaching or exceeding ~10 million rows. Below that threshold, partition pruning overhead can slow queries rather than speed them up. Target the specific event/log tables listed below — do not prematurely partition operational tables like `leave_requests` or `job_applications`.**

- [ ] Partition high-volume event/log tables by time (monthly):
  - [ ] `attendance_events` (partition by `clocked_at`)
  - [ ] `scan_logs` (partition by `created_at`)
  - [ ] `platform_audit_events` (partition by `created_at`)
  - [ ] `employee_hr_record_events` and `employee_bank_detail_events` (partition by `created_at`)
  - [ ] `audit_role_events` (partition by `created_at`)
  - [ ] `job_listing_public_metrics` (partition by `created_at`)
  - [ ] `job_application_rate_limit_events` (partition by `attempted_at`)
  - [ ] `public_token_access_events` (partition by `created_at`)
  - [ ] All notification tables if not consolidated
- [ ] Define explicit retention windows (not just vague cleanup policies) for each table category:
  - [ ] Audit logs — e.g., retain 7 years for compliance, archive to cold storage after 1 year
  - [ ] Notifications / read receipts — e.g., hard delete after 90 days
  - [ ] Job queue rows — e.g., delete processed rows after 30 days
  - [ ] Rate limit events — e.g., delete after 24–72 hours
- [ ] Introduce rollup tables for metrics (daily/hourly aggregation) — specifically `job_listing_metric_daily` to replace raw row-per-event model in `job_listing_public_metrics`
- [ ] Reduce index bloat on append-only tables using partial indexes
- [ ] Evaluate switching heavy event/log tables to `bigint GENERATED ALWAYS AS IDENTITY` or UUIDv7 IDs to avoid B-tree fragmentation from random UUIDs

---

## 🧱 Phase 5 – Structural Refactoring

> **⚠️ High effort: breaking up `employee_hr_records` will require rewriting a significant portion of application queries. Only prioritise this now if you are already experiencing row contention or lock timeouts on that table — otherwise treat it as a planned refactor for a future cycle.**

- [ ] Split `employee_hr_records` into domain-specific tables:
  - [ ] `employee_contract_terms` (FTE, hours, pay band)
  - [ ] `employee_rtw_records` (RTW status, visa info)
  - [ ] `employee_address_records`
  - [ ] `employee_emergency_contacts` (proper table — currently 3 flat text columns, also duplicated with `employee_dependants.is_emergency_contact`)
- [ ] Normalise candidate identity into a single `candidates` master table; link `job_applications` and `candidate_profiles` to it
- [ ] Remove duplicated membership/role data between `profiles` and `user_org_memberships` — pick one source of truth per field
- [ ] Consolidate the six separate notification tables (`application_notifications`, `calendar_event_notifications`, `hr_metric_notifications`, `leave_notifications`, `leave_finance_notifications`, `recruitment_notifications`) into a unified typed model
- [ ] Replace JSONB used for permanent queryable core logic with proper relational tables (e.g., `employee_case_records.linked_documents` → junction table)
- [ ] Normalise arrays (e.g., `candidate_profiles.skills`) into junction tables if heavily queried
- [ ] Drop `job_listings.posted_year` — it is a stale derived column that does not update when `published_at` changes; compute at query time instead

---

## 🧠 Phase 6 – Architecture & Consistency

- [ ] Standardise naming conventions:
  - [ ] `profile_id` vs `user_id` vs `auth_user_id` — pick one per reference target and apply consistently
  - [ ] `department_id` vs `dept_id` — standardise to one across the schema
- [ ] Remove legacy role fields:
  - [ ] `profiles.role`
  - [ ] `user_org_memberships.role`
- [ ] Fully migrate to RBAC (`org_roles`, `user_org_role_assignments`, `user_permission_overrides`)
- [ ] Standardise soft-delete strategy to `deleted_at timestamptz NULL` across the entire schema (currently using at least four different patterns: `archived_at`, `is_archived`, `voided_at`, `status = 'cancelled'`)
- [ ] Separate schemas by concern:
  - [ ] `core` — operational tables
  - [ ] `audit` — all event/history/log tables
  - [ ] `secrets` — encrypted payload tables, token tables
  - [ ] `analytics` — metrics and rollup tables
- [ ] Add immutability triggers on all audit log tables — even admins must not be able to `UPDATE` or `DELETE` rows from `platform_audit_events`, `audit_role_events`, `employee_hr_record_events`, etc.:
  ```sql
  CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
  BEGIN RAISE EXCEPTION 'Audit records are immutable'; END $$ LANGUAGE plpgsql;

  CREATE TRIGGER audit_immutable
  BEFORE UPDATE OR DELETE ON public.platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
  -- Repeat for all audit/event tables
  ```
- [ ] Add cross-tenant `org_id` consistency triggers as a second line of defence — verify that child and parent rows share the same `org_id` on insert/update; covers tables where composite FKs cannot be added immediately
- [ ] Resolve the `broadcast_channels.dept_id NOT NULL` inconsistency — channels are forced to belong to a department, but `broadcasts.is_org_wide = true` exists; these are conceptually incompatible
- [ ] Split overloaded `org_leave_settings` into purpose-specific tables (`org_leave_calendar_settings`, `org_leave_entitlement_settings`, `org_leave_statutory_settings`)

---

## 🔍 Phase 7 – Advanced Improvements

- [ ] Install `btree_gist` extension before adding any exclusion constraints — required to use equality operators (e.g., `user_id WITH =`) alongside range operators in the same constraint:
  ```sql
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  ```
- [ ] Add exclusion constraints (GiST) for overlapping time ranges — always scope with a `WHERE` filter to keep the index small and fast:
  - [ ] `rota_shifts` — prevent overlapping shifts per user `WHERE status != 'cancelled'`
  - [ ] `employee_employment_history` — prevent overlapping active periods per user `WHERE status = 'active'`
  - [ ] `interview_slots` — prevent overlapping slots per job listing `WHERE status IN ('available', 'booked')`
- [ ] Add generated or functional indexes for case-insensitive search/filter (e.g., `lower(email)`, `lower(slug)`)
- [ ] Add partial indexes for "live" subsets (active listings, pending requests, unread items)
- [ ] Document and enforce snapshot vs live data strategy — notification/audit tables store immutable text snapshots of names/titles by design; this should be explicit, not accidental
- [ ] Introduce a dedicated context table (`user_active_context`) for active org/session instead of embedding session-like state in `profiles.org_id` or `founder_acting_org`
- [ ] Add a versioned history table for `platform_legal_settings` — a single mutable singleton row loses the audit trail of legal document changes, which matters for compliance

---