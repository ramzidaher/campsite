-- Phase 2 HR Recruitment: job listings (draft / live / archive) from approved requests.
-- Public read via RPC only (no RLS for anon on table).
-- Phase 3: auto-archive when a candidate is hired can hook here via trigger on applications.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  recruitment_request_id uuid not null references public.recruitment_requests (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  slug text not null,
  title text not null,
  grade_level text not null,
  salary_band text not null,
  contract_type text not null check (contract_type in ('full_time', 'part_time', 'seasonal')),
  advert_copy text not null default '',
  requirements text not null default '',
  benefits text not null default '',
  application_mode text not null check (application_mode in ('cv', 'loom', 'staffsavvy', 'combination')),
  allow_cv boolean not null default false,
  allow_loom boolean not null default false,
  allow_staffsavvy boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'live', 'archived')),
  published_at timestamptz,
  posted_year int generated always as (
    (extract(year from (published_at at time zone 'UTC')))::int
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_listings_combination_requires_channel check (
    application_mode <> 'combination'
    or (allow_cv or allow_loom or allow_staffsavvy)
  ),
  constraint job_listings_org_slug_unique unique (org_id, slug)
);

create index job_listings_org_status_published_idx
  on public.job_listings (org_id, status, published_at desc nulls last);

create index job_listings_org_dept_idx on public.job_listings (org_id, department_id);
create index job_listings_org_grade_idx on public.job_listings (org_id, grade_level);
create index job_listings_org_contract_idx on public.job_listings (org_id, contract_type);
create index job_listings_org_salary_idx on public.job_listings (org_id, salary_band);
create index job_listings_org_year_idx on public.job_listings (org_id, posted_year);

create unique index job_listings_one_live_per_request_idx
  on public.job_listings (recruitment_request_id)
  where status = 'live';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.job_listings_validate_org_dept()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.departments d
    where d.id = new.department_id
      and d.org_id = new.org_id
  ) then
    raise exception 'department does not belong to organisation';
  end if;
  if not exists (
    select 1
    from public.recruitment_requests r
    where r.id = new.recruitment_request_id
      and r.org_id = new.org_id
      and r.department_id = new.department_id
  ) then
    raise exception 'recruitment request does not match organisation or department';
  end if;
  return new;
end;
$$;

create trigger job_listings_validate_org_dept_trg
  before insert or update of department_id, org_id, recruitment_request_id on public.job_listings
  for each row
  execute procedure public.job_listings_validate_org_dept();

create or replace function public.job_listings_touch_updated_at()
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

create trigger job_listings_updated_at_trg
  before update on public.job_listings
  for each row
  execute procedure public.job_listings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (org admins only; public uses RPC)
-- ---------------------------------------------------------------------------

alter table public.job_listings enable row level security;

create policy job_listings_select_org_admin
  on public.job_listings
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy job_listings_insert_org_admin
  on public.job_listings
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
    and created_by = auth.uid()
  );

create policy job_listings_update_org_admin
  on public.job_listings
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  )
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- Public read (no JWT org context)
-- ---------------------------------------------------------------------------

create or replace function public.public_job_listing_by_slug(
  p_org_slug text,
  p_job_slug text
)
returns table (
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
