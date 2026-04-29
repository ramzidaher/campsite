-- Job editor timeline/scheduling metadata for hiring workflow.

alter table if exists public.job_listings
  add column if not exists hide_posted_date boolean not null default false,
  add column if not exists scheduled_publish_at timestamptz,
  add column if not exists shortlisting_dates jsonb not null default '[]'::jsonb,
  add column if not exists interview_dates jsonb not null default '[]'::jsonb,
  add column if not exists start_date_needed date,
  add column if not exists role_profile_link text;

alter table public.job_listings
  drop constraint if exists job_listings_shortlisting_dates_array;
alter table public.job_listings
  add constraint job_listings_shortlisting_dates_array
  check (jsonb_typeof(shortlisting_dates) = 'array');

alter table public.job_listings
  drop constraint if exists job_listings_interview_dates_array;
alter table public.job_listings
  add constraint job_listings_interview_dates_array
  check (jsonb_typeof(interview_dates) = 'array');

-- Safety rail: do not keep stale schedule once listing is live.
update public.job_listings
set scheduled_publish_at = null
where status = 'live' and scheduled_publish_at is not null;

create or replace function public.release_due_scheduled_job_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with due_rows as (
    select id, org_id, recruitment_request_id, created_by
    from public.job_listings
    where status = 'draft'
      and scheduled_publish_at is not null
      and scheduled_publish_at <= now()
      and application_question_set_id is not null
  ),
  updated as (
    update public.job_listings jl
    set
      status = 'live',
      published_at = coalesce(jl.published_at, jl.scheduled_publish_at, now()),
      scheduled_publish_at = null
    where jl.id in (select id from due_rows)
    returning 1
  )
  select count(*) into v_count from updated;

  update public.recruitment_requests r
  set status = 'in_progress', archived_at = null
  from due_rows d
  where r.id = d.recruitment_request_id
    and r.org_id = d.org_id
    and r.status = 'approved';

  insert into public.recruitment_request_status_events (
    request_id,
    org_id,
    from_status,
    to_status,
    changed_by,
    note
  )
  select
    d.recruitment_request_id,
    d.org_id,
    'approved',
    'in_progress',
    d.created_by,
    'Auto: scheduled job published'
  from due_rows d
  join public.recruitment_requests r
    on r.id = d.recruitment_request_id
   and r.org_id = d.org_id
  where r.status = 'in_progress'
    and not exists (
      select 1
      from public.recruitment_request_status_events e
      where e.request_id = d.recruitment_request_id
        and e.org_id = d.org_id
        and e.to_status = 'in_progress'
        and e.note = 'Auto: scheduled job published'
    );

  return v_count;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'release-scheduled-job-listings'
    limit 1;

    if v_job_id is null then
      perform cron.schedule(
        'release-scheduled-job-listings',
        '* * * * *',
        $job$select public.release_due_scheduled_job_listings();$job$
      );
    end if;
  end if;
end
$$;
