-- Status/timestamp consistency guards (add as NOT VALID to avoid heavy lock work).
-- These constraints protect workflow correctness for new writes immediately.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'application_offers_signed_requires_fields_chk'
  ) then
    alter table public.application_offers
      add constraint application_offers_signed_requires_fields_chk
      check (
        status <> 'signed'
        or (signed_at is not null and signer_typed_name is not null and length(trim(signer_typed_name)) > 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'application_offers_declined_requires_declined_at_chk'
  ) then
    alter table public.application_offers
      add constraint application_offers_declined_requires_declined_at_chk
      check (status <> 'declined' or declined_at is not null) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_decided_requires_actor_and_time_chk'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_decided_requires_actor_and_time_chk
      check (
        status not in ('approved', 'rejected')
        or (decided_at is not null and decided_by is not null)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_pending_edit_requires_proposed_dates_chk'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_pending_edit_requires_proposed_dates_chk
      check (
        status <> 'pending_edit'
        or (proposed_start_date is not null and proposed_end_date is not null)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_carryover_decided_requires_actor_and_time_chk'
  ) then
    alter table public.leave_carryover_requests
      add constraint leave_carryover_decided_requires_actor_and_time_chk
      check (
        status not in ('approved', 'rejected')
        or (decided_at is not null and decided_by is not null)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_encashment_decided_requires_actor_and_time_chk'
  ) then
    alter table public.leave_encashment_requests
      add constraint leave_encashment_decided_requires_actor_and_time_chk
      check (
        status not in ('approved', 'rejected')
        or (decided_at is not null and decided_by is not null)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'toil_credit_decided_requires_actor_and_time_chk'
  ) then
    alter table public.toil_credit_requests
      add constraint toil_credit_decided_requires_actor_and_time_chk
      check (
        status not in ('approved', 'rejected')
        or (decided_at is not null and decided_by is not null)
      ) not valid;
  end if;
end $$;
