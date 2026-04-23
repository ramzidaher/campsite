# Database Audit - Actionable TODO List

This checklist is aligned to the live schema snapshot and your tenancy model:

- users can belong to multiple orgs (`user_org_memberships`)
- `profiles` acts as active-org context
- external candidates can apply to many orgs

Use status tags in each section:

- `[MISSING]` = not present in schema snapshot and should be added
- `[VALIDATE]` = appears partially handled; verify exact behavior in prod
- `[PARTIAL]` = implemented in part; follow-up step still required
- `[DONE]` = appears present in schema snapshot

---

## True Open Items (current)

Use this as the active queue; everything else below is full context/history.

1. [PARTIAL] Finalize `google_connections` encrypted-only cutover
   - enforce encrypted-only in all envs
   - drop legacy plaintext token columns when coverage is 100%
2. [PARTIAL] Finish `discount_tiers` type migration
   - migrate reads/writes to typed columns (`discount_value_pct`, `valid_on`)
   - retire legacy text fields (`discount_value`, `valid_at`)
3. [MISSING] Full RLS audit/closure for all exposed tenant tables (especially PII paths)
   - progress: began advisor-driven RLS performance/hardening pass (`20260730186000_rls_initplan_org_leave_holiday_periods.sql`)
4. [PARTIAL] Explicit `ON DELETE` strategy for privacy-erasure-sensitive graphs
   - inventory view added: `public.db_fk_delete_action_audit`
   - decide and apply target actions (`CASCADE`/`SET NULL`/`RESTRICT`) per sensitive graph
   - current audit pass confirms key workflow/event graphs are already explicit; remaining work is documenting final decisions for actor/profile references
5. [PARTIAL] Define retention windows by domain (audit, notifications, jobs, rate-limit events)
   - seeded defaults in `privacy_retention_policies`; next step is enabling/enforcing scheduled cleanup workers everywhere
6. [MISSING] Candidate identity model decision (global candidate vs org-scoped profile)
7. [MISSING] Notification model consolidation strategy (optional but recommended)
8. [MISSING] Soft-delete standardization decision (`deleted_at` vs domain-specific patterns)
9. [MISSING] Naming consistency pass (`profile_id`/`user_id`/`auth_user_id`, `dept_id`/`department_id`)
10. [PARTIAL] Confirm all remaining FK columns have supporting indexes and all queue workers use `FOR UPDATE SKIP LOCKED`
   - index audit view added: `public.db_fk_missing_index_audit`
   - phase-1 hotpath FK indexes applied in `20260730179000_hotpath_fk_indexes_phase1.sql`
   - phase-2 workflow FK indexes applied in `20260730180000_hotpath_fk_indexes_phase2.sql`; continue with remaining long-tail tables in batches
   - phase-3/4 completed and audit view corrected in `20260730181000`-`20260730183000`
   - FK index side is closed (`0` missing)
   - active queue workers now claim jobs via SKIP LOCKED (`20260730184000_notification_queue_claims_skip_locked.sql`)
   - remaining validation: ensure any future/new queue workers follow the same claim pattern

---

## Phase 0 - Migration Safety (always apply)

- [ ] Add columns nullable first; backfill; then enforce `NOT NULL`
- [ ] Use batched backfills for large tables
- [ ] Use `NOT VALID` + `VALIDATE CONSTRAINT` for new CHECK/FK where possible
- [ ] Use `CREATE INDEX CONCURRENTLY` on live systems
- [ ] Do two-step drops: stop writes first, drop in later deploy
- [ ] Test migrations on production-like data size

---

## Phase 1 - P0 Security + Tenant Integrity

### Tokens and secrets

- [VALIDATE] `portal_token_hash` exists on `job_applications` and `application_offers`; plaintext `portal_token` still exists and should be removed once fully cut over
- [DONE] Encrypt `google_connections.access_token` and `refresh_token` at rest (app/KMS + encrypted columns)

### Multi-org tenant integrity (critical for your model)

- [DONE] Add org-consistency enforcement for all profile references in tenant tables (`*_user_id`, `*_by`, `recipient_id`, `created_by`, `updated_by`, etc.) so referenced profile belongs to same `org_id` as the row
- [PARTIAL] Add composite tenant FKs where practical: child `(org_id, parent_id)` -> parent `(org_id, id)` (or trigger fallback where composite FK is impractical)
- [VALIDATE] Review all references to `profiles(id)` because `profiles.org_id` is active-context and mutable
- [VALIDATE] Confirm external candidate flows are isolated by `job_applications.org_id` and never assume candidate belongs to one org

### RLS / write path safety

- [VALIDATE] Run PII RLS review for `employee_hr_records`, `employee_bank_details`, `employee_uk_tax_details`, `employee_medical_notes`, `google_connections`, `candidate_profiles`
- [MISSING] Ensure all tenant tables in exposed schemas have explicit RLS policies
- [VALIDATE] Audit `DEFAULT auth.uid()` on `created_by` / `updated_by`; remove defaults where service-role/background jobs write rows

### FK deletion behavior

- [MISSING] Explicitly define `ON DELETE` strategy for privacy-erasure-sensitive graphs; avoid accidental `NO ACTION` deadlocks

---

## Phase 2 - P1 Data Integrity

### Must-have uniqueness (duplicate prevention)

- [DONE] `weekly_timesheets (org_id, user_id, week_start_date)` unique
- [DONE] `leave_allowances (org_id, user_id, leave_year)` unique
- [DONE] `one_on_one_pair_settings (org_id, manager_user_id, report_user_id)` unique
- [DONE] `calendar_event_attendees (event_id, profile_id)` unique
- [DONE] `wagesheet_lines (org_id, user_id, week_start_date, line_type)` unique
- [DONE] `google_connections (user_id, type)` unique
- [DONE] `hr_custom_field_values (org_id, user_id, definition_id)` unique

### Org-scoped business keys

- [DONE] `organisations.slug` globally unique
- [DONE] `job_listings (org_id, slug)` unique
- [DONE] `org_roles (org_id, key)` unique
- [DONE] `hr_custom_field_definitions (org_id, key)` unique
- [DONE] `broadcast_channels` naming uniqueness rule (per dept vs per org) and enforce with index
- [DONE] `staff_resource_folders` naming rule (parent/org scope) and enforce with index

### Singleton protection

- [DONE] `org_attendance_settings` one-row-per-org (PK `org_id`)
- [DONE] `org_leave_settings` one-row-per-org (PK `org_id`)
- [DONE] `org_hr_metric_settings` one-row-per-org (PK `org_id`)
- [VALIDATE] `platform_legal_settings` singleton (`CHECK (id = 1)`) is sufficient for your governance needs

### Active-row uniqueness

- [DONE] `employee_bank_details` should enforce one active row per `(org_id, user_id)`
- [DONE] `employee_uk_tax_details` should enforce one active row per `(org_id, user_id)`
- [VALIDATE] Decide if `employee_medical_notes` needs one-current-row rule and enforce if yes

### Time and lifecycle consistency

- [DONE] Add or validate `end >= start` / `end > start` checks on:
  - `leave_requests`
  - `rota_shifts`
  - `interview_slots`
  - `one_on_one_meetings`
  - `calendar_events`
  - `sickness_absences`
  - `weekly_timesheets`
  - `org_leave_holiday_periods`
  - `employee_employment_history`
- [DONE] Add conditional status/timestamp checks:
  - `signed` -> `signed_at` (and signer data) present
  - `declined` -> `declined_at` present
  - `approved` -> decision fields present
  - `pending_edit` -> proposed fields present

### Data type and search correctness

- [PARTIAL] Fix `discount_tiers.discount_value` and `valid_at` from `text` to proper numeric/range types
- [DONE] `search_tsv` freshness on UPDATE for `broadcasts` and `staff_resources` (generated column or trigger)

### Email normalization

- [DONE] Normalize and constrain emails (`lower(...)` functional unique index or `citext`) for:
  - `profiles.email`
  - `user_org_memberships.email`
  - `job_applications.candidate_email`
  - `google_connections.google_email`

---

## Phase 3 - Performance and workload safety

- [VALIDATE] Index all FK columns lacking supporting indexes
- [VALIDATE] Composite hot-path indexes:
  - `employee_hr_records (org_id, user_id)`
  - `leave_requests (org_id, status)` and `(org_id, start_date, end_date)`
  - `job_applications (org_id, stage/status)`
  - `job_listings (org_id, status)`
  - `attendance_events (user_id, clocked_at desc)` and `(org_id, clocked_at desc)`
  - `sickness_absences (org_id, user_id, start_date)`
  - notification tables `(recipient_id, read_at)`
- [VALIDATE] Partial indexes:
  - unread rows (`read_at IS NULL`)
  - pending jobs (`processed_at IS NULL`)
  - active/live subsets (`status = 'live'`, etc.)
- [VALIDATE] Queue workers use `FOR UPDATE SKIP LOCKED`
- [DONE] Dedupe guarantees on notification/job tables (e.g., `hr_metric_notifications.dedupe_key`)

---

## Phase 4 - Scalability and lifecycle

- [VALIDATE] Partition only event/log tables near 10M+ rows:
  - `attendance_events`, `scan_logs`, `platform_audit_events`
  - `employee_hr_record_events`, `employee_bank_detail_events`
  - `audit_role_events`, `job_listing_public_metrics`
  - `job_application_rate_limit_events`, `public_token_access_events`
- [MISSING] Define explicit retention windows by domain (audit vs notifications vs jobs vs rate-limit logs)
- [MISSING] Add rollups for high-write metrics (`job_listing_metric_daily`)

---

## Phase 5 - Structural refactors (high effort)

- [VALIDATE] Split `employee_hr_records` only if contention/lock pain is measurable
- [MISSING] Candidate identity model decision:
  - global candidate identity vs org-scoped candidate profile
  - clear links from `job_applications` / `candidate_profiles`
- [VALIDATE] Resolve dual source of truth between `profiles` and `user_org_memberships`
- [MISSING] Consolidate fragmented notification tables into typed unified model (optional but recommended)
- [VALIDATE] Replace heavily queried JSON/ARRAY fields with relational/junction models where necessary
- [MISSING] Remove stale derived column `job_listings.posted_year` or keep it generated and consistent

---

## Phase 6 - Governance and consistency

- [MISSING] Naming consistency pass (`profile_id` vs `user_id` vs `auth_user_id`, `dept_id` vs `department_id`)
- [VALIDATE] Legacy role field deprecation plan (`profiles.role`, `user_org_memberships.role`) after RBAC transition
- [VALIDATE] Complete RBAC migration (`org_roles`, `user_org_role_assignments`, `user_permission_overrides`)
- [MISSING] Standardize soft-delete semantics (`deleted_at`) or explicitly document domain-specific alternatives
- [DONE] Audit/event immutability triggers (`platform_audit_events`, `audit_role_events`, `employee_*_events`, etc.)
- [VALIDATE] `broadcast_channels.dept_id NOT NULL` vs `broadcasts.is_org_wide` model consistency

---

## Phase 7 - Advanced integrity and UX hardening

- [DONE] Add `btree_gist` and exclusion constraints for overlap prevention:
  - `rota_shifts` per user
  - `employee_employment_history` active periods
  - `interview_slots` per listing/resource
- [VALIDATE] Snapshot-vs-live policy documentation for notifications/audit text fields
- [VALIDATE] Active-org context model (`profiles.org_id` / `founder_acting_org`) and whether to move to dedicated `user_active_context`
- [DONE] Add versioned history for `platform_legal_settings`

---

## Immediate execution order (suggested)

1. Phase 1 tenant integrity + token encryption
2. Phase 2 uniqueness/check constraints
3. Phase 3 indexes and queue safety
4. Remaining phases based on observed load and product roadmap

---

## Progress log

- [DONE] Applied `20260730151000_integrity_uniques_and_date_guards.sql`
  - Added core uniqueness guards for timesheets, allowances, 1:1 pairs, attendees, wagesheet lines, Google connections, and custom field values
  - Added org-scoped unique keys for `job_listings.slug`, `org_roles.key`, and `hr_custom_field_definitions.key`
  - Added and validated chronological check constraints for key date/time ranges
- [DONE] Applied `20260730152000_google_connections_token_encryption_stage1.sql`
  - Added additive encrypted token columns (`*_encrypted`, `token_encryption_kid`, `token_encrypted_at`)
  - Kept legacy plaintext columns for compatibility during rollout
- [DONE] Applied `20260730153000_org_membership_reference_guards.sql`
  - Added membership-based tenant integrity trigger helper (`enforce_org_membership_refs`)
  - Enforced same-org membership references on core org-scoped tables (`leave_requests`, `weekly_timesheets`, `sickness_absences`, `attendance_events`, `employee_hr_records`, notifications, application notes/messages)
- [DONE] Applied `20260730154000_hotpath_notification_queue_indexes.sql`
  - Added/confirmed unread notification indexes across application/recruitment/leave/HR metric notification tables
  - Added/confirmed pending queue polling indexes on broadcast/rota/one-on-one job tables
  - Added event lookup indexes for rate-limit/token-attempt tables
- [DONE] Applied `20260730155000_status_timestamp_consistency_guards.sql`
  - Added status/timestamp consistency checks (as `NOT VALID`) for `application_offers`, `leave_requests`, `leave_carryover_requests`, `leave_encashment_requests`, and `toil_credit_requests`
  - New writes are protected immediately; legacy rows can be cleaned and validated later
- [DONE] Applied `20260730160000_org_membership_reference_guards_phase2.sql`
  - Extended membership-based tenant guards to additional leave/HR/payroll/1:1/calendar/recruitment tables
  - Cross-org user references are now blocked on insert/update across a broader set of org-scoped write paths
- [DONE] Applied `20260730161000_validate_status_consistency_constraints.sql`
  - Backfilled malformed legacy status rows for offers/leave workflows
  - Validated previously `NOT VALID` status/timestamp consistency constraints
  - Status consistency guards are now fully enforced
- [DONE] Applied `20260730162000_parent_org_fk_guards.sql`
  - Added parent-org mismatch guard helper (`enforce_parent_org_match`)
  - Enforced same-org parent references across recruitment/applications/calendar/attendance/leave/payroll notification paths
- [DONE] Applied `20260730163000_email_normalization_and_lookup_indexes.sql`
  - Backfilled normalized (trim/lower) email values on `profiles`, `user_org_memberships`, `job_applications`, and `google_connections`
  - Added write-time normalization triggers for those email fields
  - Added case-insensitive lookup indexes (`lower(email)` style) without imposing risky global uniqueness
- [DONE] Applied `20260730164000_discount_tiers_typed_columns_stage1.sql`
  - Added typed columns on `discount_tiers` (`discount_value_pct`, `valid_on`) with safe parser/backfill functions
  - Kept legacy text fields (`discount_value`, `valid_at`) for compatibility
  - Added typed constraints and performance indexes (including GiST on validity range)
- [DONE] Applied `20260730165000_discount_tiers_typed_sync_trigger.sql`
  - Added trigger-based dual-write sync from legacy text fields to typed columns on `discount_tiers`
  - Existing app writes now keep typed columns current without frontend changes
- [DONE] Applied `20260730166000_active_row_and_notification_dedupe_guards.sql`
  - Enforced one-active-row uniqueness for `employee_bank_details` and `employee_uk_tax_details` via partial unique indexes
  - Cleaned duplicate active rows safely before index creation
  - Enforced dedupe key uniqueness for `hr_metric_notifications` with pre-cleanup
- [DONE] Applied `20260730167000_channel_and_folder_naming_uniques.sql`
  - Enforced case-insensitive unique channel names per department in `broadcast_channels`
  - Enforced case-insensitive unique active folder names per `(org_id, parent_id)` in `staff_resource_folders`
  - Normalized/trimmed names and safely renamed duplicates before creating unique indexes
- [DONE] Applied `20260730168000_audit_tables_immutability_triggers.sql`
  - Added immutable UPDATE/DELETE guards on core audit/event tables (platform, privacy erasure, HR events, custom field events, recruitment status events)
  - Audit/event rows are now append-only by trigger policy
- [DONE] Applied `20260730169000_parent_org_fk_guards_phase2.sql`
  - Extended parent-org mismatch guards to screening, onboarding, review, metrics, and custom question-set link tables
  - Reduced remaining risk of cross-org parent references in secondary workflows
- [DONE] Applied `20260730170000_search_tsv_update_triggers.sql`
  - Added adaptive search-index freshness handling for `broadcasts` and `staff_resources`
  - If `search_tsv` is generated, no trigger is needed; if not generated, update triggers are installed
- [DONE] Applied `20260730171000_overlap_exclusion_constraints.sql`
  - Added `btree_gist` extension and overlap detection logic for `rota_shifts`, `interview_slots`, and `employee_employment_history`
  - `rota_shifts` exclusion creation initially skipped due to overlap data; later enforced via follow-up cleanup migration
- [DONE] Applied `20260730172000_rota_shift_overlap_cleanup_and_enforce.sql`
  - Added deterministic cleanup for overlapping assigned `rota_shifts` (secondary conflicts are unassigned and logged)
  - Added cleanup event log table: `rota_shift_overlap_cleanup_events`
  - Successfully enforced `rota_shifts_no_overlap_per_user_excl` exclusion constraint after cleanup
- [DONE] Applied `20260730173000_platform_legal_settings_history.sql`
  - Added `platform_legal_settings_history` table for versioned legal-content snapshots
  - Added insert/update capture trigger on `platform_legal_settings`
  - Backfilled current singleton row into history
- [DONE] Applied `20260730174000_google_tokens_encrypted_cutover_stage2.sql`
  - Made legacy plaintext Google token columns nullable and added token-pair presence guard
  - Backfilled encryption metadata and scrubbed plaintext where encrypted tokens exist
  - Added tracking index for rows still missing encrypted token payloads
- [DONE] Applied `20260730175000_google_tokens_encrypted_guardrails.sql`
  - Added DB trigger guard to prevent partial encrypted payload writes and auto-scrub plaintext when encrypted values exist
  - Added auto-enable encrypted-only constraint path when migration coverage reaches 100%
- [DONE] Applied `20260730176000_remove_noop_parent_org_triggers.sql`
  - Removed no-op parent-org guard triggers on `payroll_wagesheet_reviews` and `wagesheet_lines` to reduce write-path overhead
- [DONE] Applied `20260730177000_retention_policy_defaults.sql`
  - Seeded explicit per-org retention defaults for audit logs, notifications, queue rows, and rate-limit/token-attempt events
  - Added active-domain index to support retention sweeper jobs
- [DONE] Applied `20260730178000_fk_policy_and_index_audit_views.sql`
  - Added `public.db_fk_delete_action_audit` to inventory current FK `ON DELETE` behavior across `public` schema
  - Added `public.db_fk_missing_index_audit` to identify foreign keys lacking supporting leading-column indexes
- [DONE] Applied `20260730179000_hotpath_fk_indexes_phase1.sql`
  - Added/confirmed FK-leading indexes for dashboard and notification hot paths (calendar attendees, recipient-scoped notifications, queue relation links)
  - Kept migration idempotent with `IF NOT EXISTS`; existing indexes were skipped safely
- [DONE] Applied `20260730180000_hotpath_fk_indexes_phase2.sql`
  - Added/confirmed a conservative second batch of FK-leading indexes for leave, recruitment, payroll, and employee-HR workflow paths
  - Continued batched approach to reduce migration lock risk while closing `db_fk_missing_index_audit` findings
- [DONE] Applied `20260730181000_hotpath_fk_indexes_phase3.sql`
  - Added/confirmed FK-leading indexes for onboarding, performance/review, and remaining employee HR event tables
- [DONE] Applied `20260730182000_fix_fk_missing_index_audit_view.sql`
  - Corrected `db_fk_missing_index_audit` array-position logic to eliminate false positives caused by `pg_index.indkey` lower-bound behavior
- [DONE] Applied `20260730183000_hotpath_fk_indexes_phase4_tail.sql`
  - Added tail batch of remaining FK-leading indexes surfaced by the corrected audit view
  - Re-validated audit output: `db_fk_missing_index_audit` now returns `0` rows
- [DONE] Applied `20260730184000_notification_queue_claims_skip_locked.sql`
  - Added leased-claim RPCs using `FOR UPDATE SKIP LOCKED` for `rota_notification_jobs`, `calendar_event_notification_jobs`, and `one_on_one_notification_jobs`
  - Added claim metadata columns (`claimed_at`, `claim_expires_at`) and updated active queue workers to claim via RPC before processing
- [DONE] Applied `20260730185000_audit_views_security_invoker.sql`
  - Hardened introspection audit views (`db_fk_delete_action_audit`, `db_fk_missing_index_audit`) with `security_invoker = true`
  - Resolved SECURITY DEFINER advisor findings introduced by these audit views
- [DONE] Applied `20260730186000_rls_initplan_org_leave_holiday_periods.sql`
  - Optimized `org_leave_holiday_periods` RLS policies to use `(select auth.uid())`/initplan style
  - Reduces per-row auth function re-evaluation on leave holiday policy checks
- [DONE] Applied `20260730187000_rls_initplan_leave_docs_training_records.sql`
  - Optimized `leave_request_documents` and `employee_training_records` RLS policy predicates to initplan `(select auth.uid())` pattern
  - Re-ran advisors and cleared the corresponding `auth_rls_initplan` findings for those tables