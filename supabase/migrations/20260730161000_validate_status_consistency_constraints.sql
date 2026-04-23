-- Cleanup + validate status consistency constraints introduced as NOT VALID.
-- Strategy: minimally backfill legacy malformed rows, then validate constraints.

-- ---------------------------------------------------------------------------
-- application_offers
-- ---------------------------------------------------------------------------

-- Signed offers must have signed_at + signer_typed_name.
update public.application_offers
set
  signed_at = coalesce(signed_at, updated_at, created_at, now()),
  signer_typed_name = coalesce(nullif(trim(signer_typed_name), ''), 'Legacy signer')
where status = 'signed'
  and (signed_at is null or signer_typed_name is null or length(trim(signer_typed_name)) = 0);

-- Declined offers must have declined_at.
update public.application_offers
set declined_at = coalesce(declined_at, updated_at, created_at, now())
where status = 'declined'
  and declined_at is null;

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------

-- Decided leave requests must have decided_by + decided_at.
update public.leave_requests
set
  decided_at = coalesce(decided_at, updated_at, created_at, now()),
  decided_by = coalesce(decided_by, requester_id),
  decision_note = coalesce(
    nullif(trim(decision_note), ''),
    '[auto-backfilled decision metadata]'
  )
where status in ('approved', 'rejected')
  and (decided_at is null or decided_by is null);

-- pending_edit must include proposed date bounds.
update public.leave_requests
set
  proposed_start_date = coalesce(proposed_start_date, start_date),
  proposed_end_date = coalesce(proposed_end_date, end_date)
where status = 'pending_edit'
  and (proposed_start_date is null or proposed_end_date is null);

-- ---------------------------------------------------------------------------
-- leave_carryover_requests / leave_encashment_requests / toil_credit_requests
-- ---------------------------------------------------------------------------

update public.leave_carryover_requests
set
  decided_at = coalesce(decided_at, updated_at, created_at, now()),
  decided_by = coalesce(decided_by, requester_id),
  decision_note = coalesce(
    nullif(trim(decision_note), ''),
    '[auto-backfilled decision metadata]'
  )
where status in ('approved', 'rejected')
  and (decided_at is null or decided_by is null);

update public.leave_encashment_requests
set
  decided_at = coalesce(decided_at, updated_at, created_at, now()),
  decided_by = coalesce(decided_by, requester_id),
  decision_note = coalesce(
    nullif(trim(decision_note), ''),
    '[auto-backfilled decision metadata]'
  )
where status in ('approved', 'rejected')
  and (decided_at is null or decided_by is null);

update public.toil_credit_requests
set
  decided_at = coalesce(decided_at, updated_at, created_at, now()),
  decided_by = coalesce(decided_by, requester_id),
  decision_note = coalesce(
    nullif(trim(decision_note), ''),
    '[auto-backfilled decision metadata]'
  )
where status in ('approved', 'rejected')
  and (decided_at is null or decided_by is null);

-- ---------------------------------------------------------------------------
-- Validate constraints
-- ---------------------------------------------------------------------------

alter table public.application_offers
  validate constraint application_offers_signed_requires_fields_chk;

alter table public.application_offers
  validate constraint application_offers_declined_requires_declined_at_chk;

alter table public.leave_requests
  validate constraint leave_requests_decided_requires_actor_and_time_chk;

alter table public.leave_requests
  validate constraint leave_requests_pending_edit_requires_proposed_dates_chk;

alter table public.leave_carryover_requests
  validate constraint leave_carryover_decided_requires_actor_and_time_chk;

alter table public.leave_encashment_requests
  validate constraint leave_encashment_decided_requires_actor_and_time_chk;

alter table public.toil_credit_requests
  validate constraint toil_credit_decided_requires_actor_and_time_chk;
