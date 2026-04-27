-- Expand recruitment request fields to support full HR intake form.

alter table public.recruitment_requests
  add column if not exists number_of_positions integer not null default 1,
  add column if not exists regrade_status text,
  add column if not exists approval_status text,
  add column if not exists role_profile_link text,
  add column if not exists advertisement_link text,
  add column if not exists advert_release_date date,
  add column if not exists advert_closing_date date,
  add column if not exists shortlisting_dates jsonb not null default '[]'::jsonb,
  add column if not exists interview_schedule jsonb not null default '[]'::jsonb,
  add column if not exists eligibility text,
  add column if not exists pay_rate text,
  add column if not exists contract_length_detail text,
  add column if not exists additional_advertising_channels text,
  add column if not exists interview_panel_details text,
  add column if not exists needs_advert_copy_help boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_requests_number_of_positions_check'
  ) then
    alter table public.recruitment_requests
      add constraint recruitment_requests_number_of_positions_check
      check (number_of_positions > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_requests_regrade_status_check'
  ) then
    alter table public.recruitment_requests
      add constraint recruitment_requests_regrade_status_check
      check (
        regrade_status is null
        or regrade_status in (
          'requested_or_will_request',
          'not_applicable',
          'not_sure'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_requests_approval_status_check'
  ) then
    alter table public.recruitment_requests
      add constraint recruitment_requests_approval_status_check
      check (
        approval_status is null
        or approval_status in (
          'budget_and_hr_group',
          'budget_only',
          'not_approved'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_requests_eligibility_check'
  ) then
    alter table public.recruitment_requests
      add constraint recruitment_requests_eligibility_check
      check (
        eligibility is null
        or eligibility in (
          'internal_staff_only',
          'internal_and_external',
          'sussex_or_bsms_students_only'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_requests_timeline_order_check'
  ) then
    alter table public.recruitment_requests
      add constraint recruitment_requests_timeline_order_check
      check (
        advert_release_date is null
        or advert_closing_date is null
        or advert_release_date <= advert_closing_date
      );
  end if;
end
$$;
