-- Phase 5  Platform admin (CGS), org admin RLS extensions, rota sync log, org settings fields.

-- ---------------------------------------------------------------------------
-- CGS platform admins (no org; auth user ids provisioned manually)
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

alter table public.platform_admins enable row level security;

create policy platform_admins_select
  on public.platform_admins
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Bootstrap: first row when table is empty (production: prefer service-role seed).
create policy platform_admins_bootstrap_insert
  on public.platform_admins
  for insert
  to authenticated
  with check ((select count(*)::int from public.platform_admins pa) = 0);

create policy platform_admins_insert
  on public.platform_admins
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy platform_admins_delete
  on public.platform_admins
  for delete
  to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Org settings extensions
-- ---------------------------------------------------------------------------

alter table public.organisations
  add column if not exists default_notifications_enabled boolean not null default true;

alter table public.organisations
  add column if not exists deactivation_requested_at timestamptz;

comment on column public.organisations.deactivation_requested_at is
  'Set when org requests deactivation (CGS handles off-platform).';

-- ---------------------------------------------------------------------------
-- Rota / Sheets sync audit (manual + future automated syncs)
-- ---------------------------------------------------------------------------

create table public.rota_sheets_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  triggered_by uuid references public.profiles (id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'scheduled')),
  rows_imported int not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index rota_sheets_sync_log_org_idx on public.rota_sheets_sync_log (org_id, started_at desc);

alter table public.rota_sheets_sync_log enable row level security;

create policy rota_sheets_sync_log_super_select
  on public.rota_sheets_sync_log
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = rota_sheets_sync_log.org_id
        and p.role in ('super_admin', 'senior_manager')
    )
  );

create policy rota_sheets_sync_log_super_insert
  on public.rota_sheets_sync_log
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = rota_sheets_sync_log.org_id
        and p.role in ('super_admin', 'senior_manager')
    )
  );

-- ---------------------------------------------------------------------------
-- Organisations: platform admin (all orgs, including inactive)
-- ---------------------------------------------------------------------------

create policy organisations_platform_select
  on public.organisations
  for select
  to authenticated
  using (public.is_platform_admin());

create policy organisations_platform_insert
  on public.organisations
  for insert
  to authenticated
  with check (public.is_platform_admin());

create policy organisations_platform_update
  on public.organisations
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (true);

-- ---------------------------------------------------------------------------
-- Profiles: org super admin may update any profile in org (not self role/status  trigger)
-- ---------------------------------------------------------------------------

create policy profiles_update_org_super_admin
  on public.profiles
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and id <> auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = profiles.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  )
  with check (
    org_id = public.current_org_id()
  );

-- ---------------------------------------------------------------------------
-- user_departments: super admin manage membership
-- ---------------------------------------------------------------------------

create policy user_departments_super_admin_all
  on public.user_departments
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = user_departments.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = user_departments.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Broadcasts: super admin sees all in org; cancel/delete drafts
-- ---------------------------------------------------------------------------

create policy broadcasts_select_super_admin_org
  on public.broadcasts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  );

create policy broadcasts_update_super_admin_org
  on public.broadcasts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  )
  with check (org_id = public.current_org_id());

create policy broadcasts_delete_super_admin_draft
  on public.broadcasts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and status = 'draft'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role = 'super_admin'
        and p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Platform: list super admins per org (privacy  only super_admin role rows)
-- ---------------------------------------------------------------------------

create policy profiles_platform_select_super_admins
  on public.profiles
  for select
  to authenticated
  using (
    public.is_platform_admin()
    and role = 'super_admin'
  );

-- platform_admins policies above

-- ---------------------------------------------------------------------------
-- Aggregated stats (CGS dashboard  bypasses org-scoped RLS)
-- ---------------------------------------------------------------------------

create or replace function public.platform_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;
  return jsonb_build_object(
    'org_count', (select count(*)::int from public.organisations),
    'active_users', (select count(*)::int from public.profiles where status = 'active'),
    'broadcasts_30d', (
      select count(*)::int
      from public.broadcasts
      where status = 'sent'
        and sent_at is not null
        and sent_at > now() - interval '30 days'
    )
  );
end;
$$;

revoke all on function public.platform_dashboard_stats() from public;
grant execute on function public.platform_dashboard_stats() to authenticated;

