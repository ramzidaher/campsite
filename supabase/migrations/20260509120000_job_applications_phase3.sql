-- Phase 3 HR Recruitment: job applications, candidate portal token, HR notes/messages,
-- extend public job RPC, auto-archive listing when an application is marked hired.

-- ---------------------------------------------------------------------------
-- Storage bucket (private — uploads via service role / server only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('job-application-cvs', 'job-application-cvs', false)
on conflict (id) do nothing;

-- Org admins read CVs under {org_id}/ prefix
create policy job_application_cvs_select_org_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-application-cvs'
    and split_part(name, '/', 1) = (
      select (p.org_id)::text
      from public.profiles p
      where p.id = auth.uid()
    )
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- Uploads performed server-side with service role only (no insert policy for authenticated)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_listing_id uuid not null references public.job_listings (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  candidate_name text not null,
  candidate_email text not null,
  candidate_phone text,
  stage text not null default 'applied' check (
    stage in (
      'applied',
      'shortlisted',
      'interview_scheduled',
      'offer_sent',
      'hired',
      'rejected'
    )
  ),
  cv_storage_path text,
  loom_url text,
  staffsavvy_score smallint check (staffsavvy_score is null or (staffsavvy_score >= 1 and staffsavvy_score <= 5)),
  portal_token text not null unique,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index job_applications_job_email_lower_idx
  on public.job_applications (job_listing_id, lower(trim(candidate_email)));

create index job_applications_org_job_stage_idx
  on public.job_applications (org_id, job_listing_id, stage);

create index job_applications_org_dept_created_idx
  on public.job_applications (org_id, department_id, created_at desc);

create index job_applications_org_stage_created_idx
  on public.job_applications (org_id, stage, created_at desc);

create table public.job_application_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_application_id uuid not null references public.job_applications (id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index job_application_notes_app_idx
  on public.job_application_notes (job_application_id, created_at desc);

create table public.job_application_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_application_id uuid not null references public.job_applications (id) on delete cascade,
  body text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index job_application_messages_app_idx
  on public.job_application_messages (job_application_id, created_at asc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.job_applications enable row level security;
alter table public.job_application_notes enable row level security;
alter table public.job_application_messages enable row level security;

create policy job_applications_select_org_admin
  on public.job_applications
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- Updates only via RPC (no update policy)

create policy job_application_notes_select_org_admin
  on public.job_application_notes
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy job_application_notes_insert_org_admin
  on public.job_application_notes
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
    and created_by = auth.uid()
  );

create policy job_application_messages_select_org_admin
  on public.job_application_messages
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy job_application_messages_insert_org_admin
  on public.job_application_messages
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Auto-archive job listing when an application is hired
-- ---------------------------------------------------------------------------

create or replace function public.job_applications_archive_listing_on_hired()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.stage = 'hired' and old.stage is distinct from new.stage then
    update public.job_listings jl
    set status = 'archived'
    where jl.id = new.job_listing_id
      and jl.status = 'live';
  end if;
  return new;
end;
$$;

create trigger job_applications_archive_listing_on_hired_trg
  after update of stage on public.job_applications
  for each row
  when (new.stage = 'hired' and old.stage is distinct from new.stage)
  execute procedure public.job_applications_archive_listing_on_hired();

-- Note: job_listings has updated_at trigger already; archive won't bump it unless we add side effect — acceptable for Phase 3

-- ---------------------------------------------------------------------------
-- Extend public job listing RPC (add job_listing_id)
-- ---------------------------------------------------------------------------

drop function if exists public.public_job_listing_by_slug(text, text);

create function public.public_job_listing_by_slug(
  p_org_slug text,
  p_job_slug text
)
returns table (
  job_listing_id uuid,
  org_name text,
  title text,
  advert_copy text,
  requirements text,
  benefits text,
  grade_level text,
  salary_band text,
  contract_type text,
  department_name text,
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
  select
    jl.id as job_listing_id,
    o.name::text as org_name,
    jl.title,
    jl.advert_copy,
    jl.requirements,
    jl.benefits,
    jl.grade_level,
    jl.salary_band,
    jl.contract_type,
    d.name::text as department_name,
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
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';
$$;

grant execute on function public.public_job_listing_by_slug(text, text) to anon;
grant execute on function public.public_job_listing_by_slug(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_job_application
-- ---------------------------------------------------------------------------

create or replace function public.submit_job_application(
  p_org_slug text,
  p_job_slug text,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_cv_storage_path text,
  p_loom_url text,
  p_staffsavvy_score smallint
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

  if exists (
    select 1 from public.job_applications ja
    where ja.job_listing_id = v_jl.id
      and lower(trim(ja.candidate_email)) = v_email
  ) then
    raise exception 'you have already applied for this role';
  end if;

  v_dept := v_jl.department_id;

  if v_jl.allow_cv then
    requires_any := true;
    if p_cv_storage_path is not null and length(trim(p_cv_storage_path)) > 0 then
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
      if p_cv_storage_path is null or length(trim(p_cv_storage_path)) = 0 then
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
    portal_token
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
    v_token
  )
  returning id, portal_token into v_new_id, v_new_portal;

  return query select v_new_id, v_new_portal;
end;
$$;

grant execute on function public.submit_job_application(text, text, text, text, text, text, text, smallint)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Candidate portal (single row + messages jsonb)
-- ---------------------------------------------------------------------------

create or replace function public.get_candidate_application_portal(p_portal_token text)
returns table (
  org_name text,
  job_title text,
  stage text,
  submitted_at timestamptz,
  messages jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tid text := nullif(trim(p_portal_token), '');
begin
  if v_tid is null then
    return;
  end if;

  return query
  select
    o.name::text,
    jl.title::text,
    ja.stage::text,
    ja.submitted_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'body', m.body,
            'created_at', m.created_at
          )
          order by m.created_at nulls last
        )
        from public.job_application_messages m
        where m.job_application_id = ja.id
      ),
      '[]'::jsonb
    )
  from public.job_applications ja
  join public.job_listings jl on jl.id = ja.job_listing_id
  join public.organisations o on o.id = ja.org_id
  where ja.portal_token = v_tid;
end;
$$;

grant execute on function public.get_candidate_application_portal(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- HR stage change
-- ---------------------------------------------------------------------------

create or replace function public.set_job_application_stage(
  p_application_id uuid,
  p_new_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_role text;
  v_org uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = v_viewer;

  if v_role is null or v_role not in ('org_admin', 'super_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_stage not in (
    'applied',
    'shortlisted',
    'interview_scheduled',
    'offer_sent',
    'hired',
    'rejected'
  ) then
    raise exception 'invalid stage';
  end if;

  update public.job_applications ja
  set stage = p_new_stage
  where ja.id = p_application_id
    and ja.org_id = v_org;

  if not found then
    raise exception 'application not found' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.set_job_application_stage(uuid, text) to authenticated;
