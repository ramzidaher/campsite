-- v2 tenant roles (Option A  ROLE-MAPPING.md): rename literals, retire weekly_paid / senior_manager / assistant / super_admin.
-- Platform admins unchanged (platform_admins table).

-- ---------------------------------------------------------------------------
-- discount_tiers: resolve unique(org_id, role) conflicts, then remap roles
-- ---------------------------------------------------------------------------

delete from public.discount_tiers a
using public.discount_tiers b
where a.org_id = b.org_id
  and a.role = 'weekly_paid'
  and b.role = 'csa';

delete from public.discount_tiers a
using public.discount_tiers b
where a.org_id = b.org_id
  and a.role = 'assistant'
  and b.role = 'administrator';

delete from public.discount_tiers a
using public.discount_tiers b
where a.org_id = b.org_id
  and a.role = 'super_admin'
  and b.role = 'org_admin';

delete from public.discount_tiers a
using public.discount_tiers b
where a.org_id = b.org_id
  and a.role = 'senior_manager'
  and b.role = 'manager';

update public.discount_tiers set role = 'csa' where role = 'weekly_paid';
update public.discount_tiers set role = 'administrator' where role = 'assistant';
update public.discount_tiers set role = 'org_admin' where role = 'super_admin';
update public.discount_tiers set role = 'manager' where role = 'senior_manager';

alter table public.discount_tiers drop constraint if exists discount_tiers_role_check;

alter table public.discount_tiers
  add constraint discount_tiers_role_check check (
    role in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  );

-- ---------------------------------------------------------------------------
-- profiles: remap then replace CHECK
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles set role = 'csa' where role = 'weekly_paid';
update public.profiles set role = 'administrator' where role = 'assistant';
update public.profiles set role = 'org_admin' where role = 'super_admin';
update public.profiles set role = 'manager' where role = 'senior_manager';

alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  );

-- ---------------------------------------------------------------------------
-- Helper functions (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.can_approve_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pv
    join public.profiles pt on pt.id = target
    where pv.id = viewer
      and pv.org_id = pt.org_id
      and pt.status = 'pending'
      and viewer <> target
      and (
        pv.role = 'org_admin'
        or (
          pv.role = 'manager'
          and exists (
            select 1
            from public.user_departments udt
            join public.dept_managers dm
              on dm.dept_id = udt.dept_id and dm.user_id = viewer
            where udt.user_id = target
          )
        )
        or (
          pv.role = 'coordinator'
          and exists (
            select 1
            from public.user_departments udt
            join public.user_departments udt2
              on udt2.dept_id = udt.dept_id and udt2.user_id = target
            where udt.user_id = viewer
          )
        )
      )
  );
$$;

create or replace function public.can_manage_rota_for_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
begin
  select p.role into r from public.profiles p where p.id = auth.uid();
  if r is null then
    return false;
  end if;
  if r = 'org_admin' then
    return exists (
      select 1 from public.departments d
      where d.id = p_dept_id and d.org_id = public.current_org_id()
    );
  end if;
  if r = 'manager' then
    return exists (
      select 1 from public.dept_managers dm
      where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
    );
  end if;
  return false;
end;
$$;

create or replace function public.user_may_compose_broadcasts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in (
        'administrator',
        'duty_manager',
        'csa',
        'coordinator',
        'manager',
        'org_admin',
        'society_leader'
      )
  );
$$;

create or replace function public.user_may_broadcast_to_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  d record;
begin
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_role is null then
    return false;
  end if;

  select d.* into d
  from public.departments d
  where d.id = p_dept_id;

  if not found then
    return false;
  end if;

  if d.org_id <> v_org then
    return false;
  end if;

  case v_role
    when 'org_admin' then
      return true;
    when 'manager' then
      return exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
      );
    when 'coordinator' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'administrator', 'duty_manager', 'csa' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'society_leader' then
      return d.type in ('society', 'club')
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
        );
    else
      return false;
  end case;
end;
$$;

create or replace function public.broadcast_status_allowed_for_insert(p_status text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();

  if v_role in ('administrator', 'duty_manager', 'csa') then
    return p_status in ('draft', 'pending_approval');
  elsif v_role in (
    'coordinator',
    'manager',
    'org_admin',
    'society_leader'
  ) then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  return false;
end;
$$;

create or replace function public.broadcast_visible_to_reader(b public.broadcasts)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  select p.org_id, p.status into v_org, v_status
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_org <> b.org_id then
    return false;
  end if;

  if v_status <> 'active' and auth.uid() <> b.created_by then
    return false;
  end if;

  if b.status = 'sent' then
    return (
      b.created_by = auth.uid()
      or exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.cat_id = b.cat_id
          and us.subscribed = true
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
      )
    );
  end if;

  if b.status = 'draft' then
    return b.created_by = auth.uid();
  end if;

  if b.status = 'pending_approval' then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = b.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
      );
  end if;

  if b.status in ('scheduled', 'cancelled') then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
      );
  end if;

  return false;
end;
$$;

create or replace function public.decide_pending_broadcast(
  p_broadcast_id uuid,
  p_action text,
  p_rejection_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  rec public.broadcasts%rowtype;
  v_role text;
  v_org uuid;
  v_ok boolean := false;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  if p_action not in ('approve_send', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into rec from public.broadcasts where id = p_broadcast_id;
  if not found then
    raise exception 'broadcast not found';
  end if;

  if rec.status is distinct from 'pending_approval' then
    raise exception 'broadcast is not pending approval';
  end if;

  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = v_viewer
    and p.status = 'active';

  if v_org is null or v_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if rec.org_id is distinct from v_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_role = 'org_admin' then
    v_ok := true;
  elsif exists (
    select 1
    from public.dept_managers dm
    where dm.user_id = v_viewer
      and dm.dept_id = rec.dept_id
  ) then
    v_ok := true;
  end if;

  if not v_ok then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_action = 'approve_send' then
    update public.broadcasts
    set
      status = 'sent',
      sent_at = coalesce(sent_at, now()),
      reviewed_by = v_viewer,
      reviewed_at = now(),
      rejection_note = null
    where id = p_broadcast_id
      and status = 'pending_approval';
  else
    update public.broadcasts
    set
      status = 'draft',
      reviewed_by = v_viewer,
      reviewed_at = now(),
      rejection_note = coalesce(nullif(trim(p_rejection_note), ''), 'Rejected')
    where id = p_broadcast_id
      and status = 'pending_approval';
  end if;

  if not found then
    raise exception 'broadcast was modified or not pending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies  drop & recreate with org_admin / org-scoped rota
-- ---------------------------------------------------------------------------

-- Phase 1
drop policy if exists organisations_update_super_admin on public.organisations;
create policy organisations_update_org_admin
  on public.organisations
  for update
  to authenticated
  using (
    id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.org_id = organisations.id
    )
  )
  with check (
    id = public.current_org_id()
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and org_id is not null
    and role = 'csa'
  );

drop policy if exists departments_mutate_super_admin on public.departments;
create policy departments_mutate_org_admin
  on public.departments
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.org_id = departments.org_id
    )
  )
  with check (
    org_id = public.current_org_id()
  );

drop policy if exists dept_categories_mutate_super_admin on public.dept_categories;
create policy dept_categories_mutate_org_admin
  on public.dept_categories
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_categories.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_categories.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  );

drop policy if exists dept_managers_mutate_super_admin on public.dept_managers;
create policy dept_managers_mutate_org_admin
  on public.dept_managers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_managers.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_managers.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  );

-- Phase 2  broadcast manager approval path
drop policy if exists broadcasts_update_manager on public.broadcasts;
create policy broadcasts_update_manager
  on public.broadcasts
  for update
  to authenticated
  using (
    status = 'pending_approval'
    and org_id = public.current_org_id()
    and (
      exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = broadcasts.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
          and p.org_id = broadcasts.org_id
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and status in ('draft', 'scheduled', 'sent', 'cancelled')
  );

-- Phase 3  rota / calendar / sheets
drop policy if exists rota_shifts_select on public.rota_shifts;
create policy rota_shifts_select
  on public.rota_shifts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'org_admin'
      )
      or exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = rota_shifts.dept_id
      )
    )
  );

drop policy if exists rota_shifts_insert on public.rota_shifts;
create policy rota_shifts_insert
  on public.rota_shifts
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      (
        dept_id is not null
        and public.can_manage_rota_for_dept(dept_id)
      )
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'org_admin'
        )
      )
    )
  );

drop policy if exists rota_shifts_update on public.rota_shifts;
create policy rota_shifts_update
  on public.rota_shifts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'org_admin'
        )
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'org_admin'
        )
      )
    )
  );

drop policy if exists rota_shifts_delete on public.rota_shifts;
create policy rota_shifts_delete
  on public.rota_shifts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role = 'org_admin'
        )
      )
    )
  );

drop policy if exists calendar_events_insert_managed on public.calendar_events;
create policy calendar_events_insert_managed
  on public.calendar_events
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and source in ('manual', 'rota')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('org_admin', 'manager')
    )
  );

drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update
  on public.calendar_events
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('org_admin', 'manager')
      )
    )
  )
  with check (org_id = public.current_org_id());

drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete
  on public.calendar_events
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('org_admin', 'manager')
      )
    )
  );

drop policy if exists sheets_mappings_select on public.sheets_mappings;
create policy sheets_mappings_select
  on public.sheets_mappings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role = 'org_admin'
    )
  );

drop policy if exists sheets_mappings_write on public.sheets_mappings;
create policy sheets_mappings_write
  on public.sheets_mappings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role = 'org_admin'
    )
  );

-- Phase 4  discounts
drop policy if exists discount_tiers_insert on public.discount_tiers;
create policy discount_tiers_insert
  on public.discount_tiers
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.status = 'active'
    )
  );

drop policy if exists discount_tiers_update on public.discount_tiers;
create policy discount_tiers_update
  on public.discount_tiers
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.status = 'active'
    )
  )
  with check (org_id = public.current_org_id());

drop policy if exists discount_tiers_delete on public.discount_tiers;
create policy discount_tiers_delete
  on public.discount_tiers
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.status = 'active'
    )
  );

drop policy if exists scan_logs_super_admin_select on public.scan_logs;
create policy scan_logs_org_admin_select
  on public.scan_logs
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'org_admin' and p.status = 'active'
    )
  );

-- Phase 5  org admin extensions
drop policy if exists rota_sheets_sync_log_super_select on public.rota_sheets_sync_log;
create policy rota_sheets_sync_log_org_admin_select
  on public.rota_sheets_sync_log
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = rota_sheets_sync_log.org_id
        and p.role = 'org_admin'
    )
  );

drop policy if exists rota_sheets_sync_log_super_insert on public.rota_sheets_sync_log;
create policy rota_sheets_sync_log_org_admin_insert
  on public.rota_sheets_sync_log
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = rota_sheets_sync_log.org_id
        and p.role = 'org_admin'
    )
  );

drop policy if exists profiles_update_org_super_admin on public.profiles;
create policy profiles_update_org_admin
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
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  )
  with check (
    org_id = public.current_org_id()
  );

drop policy if exists user_departments_super_admin_all on public.user_departments;
create policy user_departments_org_admin_all
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
        and p.role = 'org_admin'
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
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  );

drop policy if exists broadcasts_select_super_admin_org on public.broadcasts;
create policy broadcasts_select_org_admin_org
  on public.broadcasts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  );

drop policy if exists broadcasts_update_super_admin_org on public.broadcasts;
create policy broadcasts_update_org_admin_org
  on public.broadcasts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  )
  with check (org_id = public.current_org_id());

drop policy if exists broadcasts_delete_super_admin_draft on public.broadcasts;
create policy broadcasts_delete_org_admin_draft
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
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  );

drop policy if exists profiles_platform_select_super_admins on public.profiles;
create policy profiles_platform_select_org_admins
  on public.profiles
  for select
  to authenticated
  using (
    public.is_platform_admin()
    and role = 'org_admin'
  );
