-- Candidate portal foundation:
-- 1) public jobs index RPC
-- 2) candidate profile model (separate from staff profiles)
-- 3) optional linking of job applications to candidate auth user
-- 4) authenticated candidate dashboard RPC

create table if not exists public.candidate_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  location text,
  linkedin_url text,
  portfolio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_profiles enable row level security;

drop policy if exists candidate_profiles_select_self on public.candidate_profiles;
create policy candidate_profiles_select_self
  on public.candidate_profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists candidate_profiles_insert_self on public.candidate_profiles;
create policy candidate_profiles_insert_self
  on public.candidate_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists candidate_profiles_update_self on public.candidate_profiles;
create policy candidate_profiles_update_self
  on public.candidate_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.candidate_profiles_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists candidate_profiles_updated_at_trg on public.candidate_profiles;
create trigger candidate_profiles_updated_at_trg
  before update on public.candidate_profiles
  for each row
  execute procedure public.candidate_profiles_touch_updated_at();

alter table public.job_applications
  add column if not exists candidate_user_id uuid references auth.users (id) on delete set null;

create unique index if not exists job_applications_job_candidate_user_unique_idx
  on public.job_applications (job_listing_id, candidate_user_id)
  where candidate_user_id is not null;

drop function if exists public.submit_job_application(text, text, text, text, text, text, text, smallint, boolean, text, text, text, text, text);

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
  p_motivation_text text default null,
  p_candidate_user_id uuid default null
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

  if p_candidate_user_id is not null then
    if exists (
      select 1 from public.job_applications ja
      where ja.job_listing_id = v_jl.id
        and ja.candidate_user_id = p_candidate_user_id
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
    candidate_user_id
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
    p_candidate_user_id
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
  uuid
)
  to anon, authenticated;

create or replace function public.public_job_listings(
  p_org_slug text,
  p_search text default null,
  p_department text default null,
  p_contract_type text default null,
  p_limit int default 12,
  p_offset int default 0
)
returns table (
  job_listing_id uuid,
  slug text,
  org_name text,
  title text,
  department_name text,
  grade_level text,
  salary_band text,
  contract_type text,
  application_mode text,
  allow_cv boolean,
  allow_loom boolean,
  allow_staffsavvy boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      jl.id as job_listing_id,
      jl.slug,
      o.name::text as org_name,
      jl.title,
      d.name::text as department_name,
      jl.grade_level,
      jl.salary_band,
      jl.contract_type,
      jl.application_mode,
      jl.allow_cv,
      jl.allow_loom,
      jl.allow_staffsavvy,
      jl.published_at
    from public.job_listings jl
    join public.organisations o
      on o.id = jl.org_id
      and o.is_active = true
      and o.slug = nullif(trim(p_org_slug), '')
    join public.departments d
      on d.id = jl.department_id
      and d.org_id = jl.org_id
    where jl.status = 'live'
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or jl.title ilike '%' || trim(p_search) || '%'
        or jl.advert_copy ilike '%' || trim(p_search) || '%'
        or d.name ilike '%' || trim(p_search) || '%'
      )
      and (
        nullif(trim(coalesce(p_department, '')), '') is null
        or d.name = trim(p_department)
      )
      and (
        nullif(trim(coalesce(p_contract_type, '')), '') is null
        or jl.contract_type = trim(p_contract_type)
      )
  )
  select *
  from base
  order by published_at desc nulls last, title asc
  limit greatest(1, least(coalesce(p_limit, 12), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.public_job_listings(text, text, text, text, int, int) to anon, authenticated;

create or replace function public.get_my_candidate_applications()
returns table (
  application_id uuid,
  portal_token text,
  org_name text,
  job_title text,
  stage text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ja.id as application_id,
    ja.portal_token,
    o.name::text as org_name,
    jl.title::text as job_title,
    ja.stage::text,
    ja.submitted_at
  from public.job_applications ja
  join public.job_listings jl on jl.id = ja.job_listing_id
  join public.organisations o on o.id = ja.org_id
  where ja.candidate_user_id = auth.uid()
  order by ja.submitted_at desc;
$$;

grant execute on function public.get_my_candidate_applications() to authenticated;
