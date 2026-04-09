-- Phase 7: Data integrity + cleanup
-- 7.1 Keep org_permission_policies (it is actively used by has_permission()).
--     Document intended use explicitly.
-- 7.3 Add DB-level throttling to submit_job_application().
-- 7.4 Add safe defaults for remaining created_by/updated_by columns in HR paths.

-- ---------------------------------------------------------------------------
-- 7.1 Document org_permission_policies intent
-- ---------------------------------------------------------------------------

comment on table public.org_permission_policies is
  'Optional per-org permission context policies consumed by has_permission(); currently supports requires_approval boolean rule.';

-- ---------------------------------------------------------------------------
-- 7.4 Defaults for audit actor columns (fallback safety)
-- ---------------------------------------------------------------------------

alter table public.sickness_absences
  alter column created_by set default auth.uid();

alter table public.employee_hr_records
  alter column updated_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 7.3 Postgres-level rate limit for submit_job_application
-- ---------------------------------------------------------------------------

create table if not exists public.job_application_rate_limit_events (
  id bigserial primary key,
  actor_key text not null,
  org_id uuid references public.organisations(id) on delete cascade,
  job_listing_id uuid not null references public.job_listings(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists job_application_rate_limit_events_lookup_idx
  on public.job_application_rate_limit_events (job_listing_id, actor_key, attempted_at desc);

comment on table public.job_application_rate_limit_events is
  'Rolling event log used to throttle submit_job_application calls and reduce spam/flood abuse.';

alter table public.job_application_rate_limit_events enable row level security;

drop policy if exists job_application_rate_limit_events_no_select on public.job_application_rate_limit_events;
create policy job_application_rate_limit_events_no_select
  on public.job_application_rate_limit_events
  for select
  to authenticated
  using (false);

drop policy if exists job_application_rate_limit_events_no_insert on public.job_application_rate_limit_events;
create policy job_application_rate_limit_events_no_insert
  on public.job_application_rate_limit_events
  for insert
  to authenticated
  with check (false);

drop policy if exists job_application_rate_limit_events_no_update on public.job_application_rate_limit_events;
create policy job_application_rate_limit_events_no_update
  on public.job_application_rate_limit_events
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists job_application_rate_limit_events_no_delete on public.job_application_rate_limit_events;
create policy job_application_rate_limit_events_no_delete
  on public.job_application_rate_limit_events
  for delete
  to authenticated
  using (false);

drop function if exists public.submit_job_application(
  text, text, text, text, text, text, text, smallint, boolean, text, text, text, text, text
);

create function public.submit_job_application(
  p_org_slug text,
  p_job_slug text,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_cv_storage_path text,
  p_loom_url text,
  p_staffsavvy_score smallint,
  p_expect_cv_upload boolean default false,
  p_candidate_location text default null,
  p_current_title text default null,
  p_linkedin_url text default null,
  p_portfolio_url text default null,
  p_motivation_text text default null
)
returns table (application_id uuid, portal_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jl public.job_listings%rowtype;
  v_token text;
  v_new_id uuid;
  v_new_portal text;
  v_email text;
  v_name text;
  v_dept uuid;
  requires_any boolean := false;
  filled_channels int := 0;
  v_cv_filled boolean;
  v_actor_key text;
  v_rate_window_start timestamptz := now() - interval '10 minutes';
  v_recent_attempts int := 0;
begin
  v_name := nullif(trim(p_candidate_name), '');
  v_email := lower(trim(p_candidate_email));
  if v_name is null then
    raise exception 'name required';
  end if;
  if v_email is null or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'valid email required';
  end if;

  select jl.* into v_jl
  from public.job_listings jl
  join public.organisations o on o.id = jl.org_id and o.is_active = true and o.slug = nullif(trim(p_org_slug), '')
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';

  if not found then
    raise exception 'job not found or not accepting applications';
  end if;

  -- Lightweight DB-side anti-spam throttle.
  -- Uses best-available actor key:
  --   authenticated user id, else client IP (if available), else anon fallback.
  v_actor_key := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(inet_client_addr()::text, ''),
    'anon'
  );

  insert into public.job_application_rate_limit_events (actor_key, org_id, job_listing_id)
  values (v_actor_key, v_jl.org_id, v_jl.id);

  select count(*)::int
    into v_recent_attempts
  from public.job_application_rate_limit_events e
  where e.job_listing_id = v_jl.id
    and e.actor_key = v_actor_key
    and e.attempted_at >= v_rate_window_start;

  -- Allow normal retries but block obvious bursts.
  if v_recent_attempts > 15 then
    raise exception 'too many application attempts; please wait and try again';
  end if;

  if exists (
    select 1 from public.job_applications ja
    where ja.job_listing_id = v_jl.id
      and lower(trim(ja.candidate_email)) = v_email
  ) then
    raise exception 'you have already applied for this role';
  end if;

  v_dept := v_jl.department_id;

  v_cv_filled := (
    (p_cv_storage_path is not null and length(trim(p_cv_storage_path)) > 0)
    or (coalesce(p_expect_cv_upload, false) and v_jl.allow_cv)
  );

  if v_jl.allow_cv then
    requires_any := true;
    if v_cv_filled then
      filled_channels := filled_channels + 1;
    end if;
  end if;
  if v_jl.allow_loom then
    requires_any := true;
    if p_loom_url is not null and length(trim(p_loom_url)) > 0 then
      filled_channels := filled_channels + 1;
    end if;
  end if;
  if v_jl.allow_staffsavvy then
    requires_any := true;
    if p_staffsavvy_score is not null then
      filled_channels := filled_channels + 1;
    end if;
  end if;

  if v_jl.application_mode <> 'combination' then
    if v_jl.allow_cv and not v_jl.allow_loom and not v_jl.allow_staffsavvy then
      if not v_cv_filled then
        raise exception 'cv required';
      end if;
    elsif v_jl.allow_loom and not v_jl.allow_cv and not v_jl.allow_staffsavvy then
      if p_loom_url is null or length(trim(p_loom_url)) = 0 then
        raise exception 'loom url required';
      end if;
    elsif v_jl.allow_staffsavvy and not v_jl.allow_cv and not v_jl.allow_loom then
      if p_staffsavvy_score is null then
        raise exception 'staffsavvy score required';
      end if;
    end if;
  else
    if requires_any and filled_channels < 1 then
      raise exception 'complete at least one application field required for this job';
    end if;
  end if;

  if p_staffsavvy_score is not null and not v_jl.allow_staffsavvy then
    raise exception 'invalid application';
  end if;
  if p_cv_storage_path is not null and length(trim(p_cv_storage_path)) > 0 and not v_jl.allow_cv then
    raise exception 'invalid application';
  end if;
  if coalesce(p_expect_cv_upload, false) and not v_jl.allow_cv then
    raise exception 'invalid application';
  end if;
  if p_loom_url is not null and length(trim(p_loom_url)) > 0 and not v_jl.allow_loom then
    raise exception 'invalid application';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.job_applications as ja (
    org_id,
    job_listing_id,
    department_id,
    candidate_name,
    candidate_email,
    candidate_phone,
    stage,
    cv_storage_path,
    loom_url,
    staffsavvy_score,
    portal_token,
    candidate_location,
    current_title,
    linkedin_url,
    portfolio_url,
    motivation_text
  ) values (
    v_jl.org_id,
    v_jl.id,
    v_dept,
    v_name,
    v_email,
    nullif(trim(p_candidate_phone), ''),
    'applied',
    nullif(trim(p_cv_storage_path), ''),
    nullif(trim(p_loom_url), ''),
    p_staffsavvy_score,
    v_token,
    nullif(trim(p_candidate_location), ''),
    nullif(trim(p_current_title), ''),
    nullif(trim(p_linkedin_url), ''),
    nullif(trim(p_portfolio_url), ''),
    nullif(trim(p_motivation_text), '')
  )
  returning ja.id, ja.portal_token into v_new_id, v_new_portal;

  return query select v_new_id, v_new_portal;
end;
$$;

grant execute on function public.submit_job_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  boolean,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;
