-- HR metrics: org settings, optional listing diversity targets, voluntary equality monitoring on applications.

-- ---------------------------------------------------------------------------
-- org_hr_metric_settings (one row per org; created on demand)
-- ---------------------------------------------------------------------------

create table if not exists public.org_hr_metric_settings (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  bradford_alert_threshold numeric not null default 200
    check (bradford_alert_threshold > 0),
  working_hours_use_contract boolean not null default true,
  working_hours_absolute_max numeric(5, 2)
    check (working_hours_absolute_max is null or (working_hours_absolute_max > 0 and working_hours_absolute_max <= 168)),
  diversity_evaluation_window_days integer not null default 90
    check (diversity_evaluation_window_days > 0 and diversity_evaluation_window_days <= 730),
  diversity_min_sample_size integer not null default 5
    check (diversity_min_sample_size >= 0),
  eq_category_codes jsonb not null default '[]'::jsonb,
  metrics_enabled jsonb not null default '{"bradford": true, "working_hours": true, "diversity": true, "probation": true, "missing_hr_record": true, "review_cycle": true}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.org_hr_metric_settings is
  'Per-org thresholds and options for automated HR metric alerts.';
comment on column public.org_hr_metric_settings.eq_category_codes is
  'JSON array of { "code": string, "label": string } for voluntary equality monitoring.';

create index if not exists org_hr_metric_settings_org_idx on public.org_hr_metric_settings (org_id);

alter table public.org_hr_metric_settings enable row level security;

drop policy if exists org_hr_metric_settings_select on public.org_hr_metric_settings;
create policy org_hr_metric_settings_select
  on public.org_hr_metric_settings for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
  );

drop policy if exists org_hr_metric_settings_mutate on public.org_hr_metric_settings;
create policy org_hr_metric_settings_mutate
  on public.org_hr_metric_settings for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
  );

-- ---------------------------------------------------------------------------
-- job_listings: optional diversity target for a vacancy
-- ---------------------------------------------------------------------------

alter table public.job_listings
  add column if not exists diversity_target_pct numeric(5, 2)
    check (diversity_target_pct is null or (diversity_target_pct >= 0 and diversity_target_pct <= 100)),
  add column if not exists diversity_included_codes text[] not null default '{}'::text[];

comment on column public.job_listings.diversity_target_pct is
  'Minimum % of applicants (with equality data) in diversity_included_codes over the evaluation window; alert if below.';
comment on column public.job_listings.diversity_included_codes is
  'Eq ethnicity codes (from org_hr_metric_settings) that count toward the diversity share for this listing.';

-- ---------------------------------------------------------------------------
-- job_applications: voluntary equality monitoring
-- ---------------------------------------------------------------------------

alter table public.job_applications
  add column if not exists eq_ethnicity_code text,
  add column if not exists equality_monitoring_declined boolean not null default false,
  add column if not exists equality_monitoring_recorded_at timestamptz;

comment on column public.job_applications.eq_ethnicity_code is
  'Optional self-reported code matching org eq_category_codes; null if not answered.';
comment on column public.job_applications.equality_monitoring_declined is
  'True when the candidate explicitly skipped equality monitoring.';

-- ---------------------------------------------------------------------------
-- submit_job_application: optional EQ args (must match latest signature)
-- ---------------------------------------------------------------------------

drop function if exists public.submit_job_application(
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
  text,
  text
);

create or replace function public.submit_job_application(
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
  p_motivation_text text default null,
  p_cover_letter text default null,
  p_eq_ethnicity_code text default null,
  p_equality_monitoring_declined boolean default false
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
  v_submitter uuid;
  v_auth_email text;
  v_eq_code text;
  v_declined boolean;
  v_eq_at timestamptz;
  v_allowed boolean;
  v_codes jsonb;
  elem jsonb;
begin
  v_submitter := auth.uid();

  v_name := nullif(trim(p_candidate_name), '');
  v_email := lower(trim(p_candidate_email));
  if v_name is null then
    raise exception 'name required';
  end if;
  if v_email is null or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'valid email required';
  end if;

  if v_submitter is not null then
    select lower(trim(u.email)) into v_auth_email
    from auth.users u
    where u.id = v_submitter;
    if v_auth_email is null or v_auth_email <> v_email then
      raise exception 'email must match your signed-in account';
    end if;
  end if;

  select jl.* into v_jl
  from public.job_listings jl
  join public.organisations o on o.id = jl.org_id and o.is_active = true and o.slug = nullif(trim(p_org_slug), '')
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';

  if not found then
    raise exception 'job not found or not accepting applications';
  end if;

  if v_submitter is not null then
    if exists (
      select 1 from public.job_applications ja
      where ja.job_listing_id = v_jl.id
        and ja.candidate_user_id = v_submitter
    ) then
      raise exception 'you have already applied for this role';
    end if;
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

  -- Equality monitoring (optional)
  v_declined := coalesce(p_equality_monitoring_declined, false);
  v_eq_code := nullif(trim(p_eq_ethnicity_code), '');
  if v_declined and v_eq_code is not null then
    raise exception 'invalid equality monitoring';
  end if;
  if v_eq_code is not null then
    select coalesce(s.eq_category_codes, '[]'::jsonb)
    into v_codes
    from public.org_hr_metric_settings s
    where s.org_id = v_jl.org_id;
    if v_codes is null then
      v_codes := '[]'::jsonb;
    end if;
    v_allowed := false;
    for elem in select jsonb_array_elements(coalesce(v_codes, '[]'::jsonb))
    loop
      if lower(trim(elem->>'code')) = lower(v_eq_code) then
        v_allowed := true;
        exit;
      end if;
    end loop;
    if not v_allowed then
      raise exception 'invalid equality monitoring code';
    end if;
    v_eq_at := now();
  elsif v_declined then
    v_eq_at := now();
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.job_applications (
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
    motivation_text,
    cover_letter,
    candidate_user_id,
    eq_ethnicity_code,
    equality_monitoring_declined,
    equality_monitoring_recorded_at
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
    nullif(trim(p_motivation_text), ''),
    nullif(trim(p_cover_letter), ''),
    v_submitter,
    case when v_eq_code is not null then v_eq_code else null end,
    v_declined,
    v_eq_at
  )
  returning id, portal_token into v_new_id, v_new_portal;

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
  text,
  text,
  text,
  boolean
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: upsert org HR metric settings (HR admin)
-- ---------------------------------------------------------------------------

create or replace function public.org_hr_metric_settings_upsert(
  p_bradford_alert_threshold numeric default null,
  p_working_hours_use_contract boolean default null,
  p_working_hours_absolute_max numeric default null,
  p_diversity_evaluation_window_days integer default null,
  p_diversity_min_sample_size integer default null,
  p_eq_category_codes jsonb default null,
  p_metrics_enabled jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  insert into public.org_hr_metric_settings (org_id)
  values (v_org)
  on conflict (org_id) do nothing;

  update public.org_hr_metric_settings s
  set
    bradford_alert_threshold = coalesce(p_bradford_alert_threshold, s.bradford_alert_threshold),
    working_hours_use_contract = coalesce(p_working_hours_use_contract, s.working_hours_use_contract),
    working_hours_absolute_max = case when p_working_hours_absolute_max is null then s.working_hours_absolute_max else p_working_hours_absolute_max end,
    diversity_evaluation_window_days = coalesce(p_diversity_evaluation_window_days, s.diversity_evaluation_window_days),
    diversity_min_sample_size = coalesce(p_diversity_min_sample_size, s.diversity_min_sample_size),
    eq_category_codes = coalesce(p_eq_category_codes, s.eq_category_codes),
    metrics_enabled = coalesce(p_metrics_enabled, s.metrics_enabled),
    updated_at = now()
  where s.org_id = v_org;

  return (select to_jsonb(s.*) from public.org_hr_metric_settings s where s.org_id = v_org);
end;
$$;

revoke all on function public.org_hr_metric_settings_upsert(numeric, boolean, numeric, integer, integer, jsonb, jsonb) from public;
grant execute on function public.org_hr_metric_settings_upsert(numeric, boolean, numeric, integer, integer, jsonb, jsonb) to authenticated;

create or replace function public.org_hr_metric_settings_get()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  r jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  insert into public.org_hr_metric_settings (org_id)
  values (v_org)
  on conflict (org_id) do nothing;

  select to_jsonb(s.*) into r from public.org_hr_metric_settings s where s.org_id = v_org;
  return r;
end;
$$;

revoke all on function public.org_hr_metric_settings_get() from public;
grant execute on function public.org_hr_metric_settings_get() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: set diversity targets on a job listing (HR)
-- ---------------------------------------------------------------------------

create or replace function public.job_listing_diversity_targets_set(
  p_job_listing_id uuid,
  p_target_pct numeric,
  p_included_codes text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  n int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  update public.job_listings jl
  set
    diversity_target_pct = p_target_pct,
    diversity_included_codes = coalesce(p_included_codes, jl.diversity_included_codes),
    updated_at = now()
  where jl.id = p_job_listing_id
    and jl.org_id = v_org;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'listing not found';
  end if;
end;
$$;

revoke all on function public.job_listing_diversity_targets_set(uuid, numeric, text[]) from public;
grant execute on function public.job_listing_diversity_targets_set(uuid, numeric, text[]) to authenticated;
