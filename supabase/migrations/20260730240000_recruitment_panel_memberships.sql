-- Recruitment panel memberships per job listing, with in-app notifications.

create table if not exists public.job_listing_panelists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  job_listing_id uuid not null references public.job_listings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_listing_id, profile_id)
);

create index if not exists job_listing_panelists_profile_idx
  on public.job_listing_panelists (profile_id, created_at desc);

create index if not exists job_listing_panelists_job_idx
  on public.job_listing_panelists (job_listing_id, created_at desc);

alter table public.job_listing_panelists enable row level security;

drop policy if exists job_listing_panelists_select_self_or_jobs_view on public.job_listing_panelists;
create policy job_listing_panelists_select_self_or_jobs_view
  on public.job_listing_panelists
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
    or has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
    or has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
  );

drop policy if exists job_listing_panelists_service_all on public.job_listing_panelists;
create policy job_listing_panelists_service_all
  on public.job_listing_panelists
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.recruitment_notifications
  drop constraint if exists recruitment_notifications_kind_check;

alter table public.recruitment_notifications
  add constraint recruitment_notifications_kind_check
  check (kind in ('new_request', 'status_changed', 'panel_assignment'));
