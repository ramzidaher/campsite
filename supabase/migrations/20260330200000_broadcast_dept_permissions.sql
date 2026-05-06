-- Plan 02  Department broadcast toggles + org-wide / mandatory / pin (mainaccesslevel.md).
-- Depends on v2 roles migration (org_admin, coordinator, …).

-- ---------------------------------------------------------------------------
-- Per-department toggles (off by default; org admin grants rows)
-- ---------------------------------------------------------------------------

create table public.dept_broadcast_permissions (
  dept_id uuid not null references public.departments (id) on delete cascade,
  permission text not null check (
    permission in (
      'send_org_wide',
      'send_no_approval',
      'edit_others_broadcasts',
      'delete_dept_broadcasts',
      'delete_org_broadcasts',
      'pin_broadcasts',
      'mandatory_broadcast'
    )
  ),
  min_role text not null check (min_role in ('manager', 'coordinator', 'coordinator_only')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (dept_id, permission)
);

create index dept_broadcast_permissions_dept_idx
  on public.dept_broadcast_permissions (dept_id);

comment on table public.dept_broadcast_permissions is
  'Org-admin-granted broadcast powers per department; union with role baseline (Plan 02).';

alter table public.dept_broadcast_permissions enable row level security;

create policy dept_broadcast_permissions_select_org
  on public.dept_broadcast_permissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = dept_broadcast_permissions.dept_id
        and d.org_id = public.current_org_id()
    )
  );

create policy dept_broadcast_permissions_mutate_org_admin
  on public.dept_broadcast_permissions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_broadcast_permissions.dept_id
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
      where d.id = dept_broadcast_permissions.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
        and p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Broadcasts: delivery / feed flags
-- ---------------------------------------------------------------------------

alter table public.broadcasts
  add column if not exists is_mandatory boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_org_wide boolean not null default false;

comment on column public.broadcasts.is_mandatory is
  'When sent, visible to all active org members regardless of category subscription (sender needs dept toggle).';
comment on column public.broadcasts.is_pinned is
  'Feed ordering hint: show before non-pinned (client sorts; manager + toggle).';
comment on column public.broadcasts.is_org_wide is
  'Sent with org-wide intent; visibility still uses subscriptions unless is_mandatory.';

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.user_has_dept_broadcast_permission(
  p_user_id uuid,
  p_dept_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_user_id is null or p_dept_id is null or p_permission is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
    and p.status = 'active';

  if v_role is null then
    return false;
  end if;

  if v_role = 'org_admin' then
    return true;
  end if;

  return exists (
    select 1
    from public.dept_broadcast_permissions dbp
    where dbp.dept_id = p_dept_id
      and dbp.permission = p_permission
      and (
        (dbp.min_role = 'manager'
          and v_role = 'manager'
          and exists (
            select 1 from public.dept_managers dm
            where dm.user_id = p_user_id and dm.dept_id = p_dept_id
          ))
        or (dbp.min_role = 'coordinator'
          and v_role in ('manager', 'coordinator')
          and (
            exists (
              select 1 from public.dept_managers dm
              where dm.user_id = p_user_id and dm.dept_id = p_dept_id
            )
            or exists (
              select 1 from public.user_departments ud
              where ud.user_id = p_user_id and ud.dept_id = p_dept_id
            )
          ))
        or (dbp.min_role = 'coordinator_only'
          and v_role = 'coordinator'
          and exists (
            select 1 from public.user_departments ud
            where ud.user_id = p_user_id and ud.dept_id = p_dept_id
          ))
      )
  );
end;
$$;

revoke all on function public.user_has_dept_broadcast_permission(uuid, uuid, text) from public;
grant execute on function public.user_has_dept_broadcast_permission(uuid, uuid, text) to authenticated;

create or replace function public.user_has_any_dept_broadcast_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_user_id is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
    and p.status = 'active';

  if v_role = 'org_admin' then
    return true;
  end if;

  return exists (
    select 1
    from public.dept_broadcast_permissions dbp
    where dbp.permission = p_permission
      and public.user_has_dept_broadcast_permission(p_user_id, dbp.dept_id, p_permission)
  );
end;
$$;

revoke all on function public.user_has_any_dept_broadcast_permission(uuid, text) from public;
grant execute on function public.user_has_any_dept_broadcast_permission(uuid, text) to authenticated;

-- Insert / update row validation: statuses + flags vs role + toggles
create or replace function public.broadcast_form_allowed(
  p_status text,
  p_dept_id uuid,
  p_is_org_wide boolean,
  p_is_mandatory boolean,
  p_is_pinned boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid
    and p.status = 'active';

  if v_role is null then
    return false;
  end if;

  if coalesce(p_is_org_wide, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'send_org_wide') then
    return false;
  end if;

  if coalesce(p_is_mandatory, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'mandatory_broadcast') then
    return false;
  end if;

  if coalesce(p_is_pinned, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'pin_broadcasts') then
    return false;
  end if;

  if v_role = 'org_admin' or v_role = 'society_leader' then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  if v_role in ('administrator', 'duty_manager', 'csa') then
    if coalesce(p_is_org_wide, false) or coalesce(p_is_mandatory, false) or coalesce(p_is_pinned, false) then
      return false;
    end if;
    return p_status in ('draft', 'pending_approval');
  end if;

  if v_role = 'coordinator' then
    if public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'send_no_approval') then
      return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
    end if;
    return p_status in ('draft', 'pending_approval');
  end if;

  if v_role = 'manager' then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  return false;
end;
$$;

revoke all on function public.broadcast_form_allowed(text, uuid, boolean, boolean, boolean) from public;
grant execute on function public.broadcast_form_allowed(text, uuid, boolean, boolean, boolean) to authenticated;

-- Back-compat name used by older policies  delegate with default flags false
create or replace function public.broadcast_status_allowed_for_insert(p_status text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
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
    if b.is_mandatory then
      return true;
    end if;
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

-- ---------------------------------------------------------------------------
-- RLS: broadcasts insert / update / delete
-- ---------------------------------------------------------------------------

drop policy if exists broadcasts_insert_scoped on public.broadcasts;

create policy broadcasts_insert_scoped
  on public.broadcasts
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and public.user_may_compose_broadcasts()
    and public.user_may_broadcast_to_dept(dept_id)
    and public.broadcast_form_allowed(
      status,
      dept_id,
      coalesce(is_org_wide, false),
      coalesce(is_mandatory, false),
      coalesce(is_pinned, false)
    )
    and status <> 'cancelled'
    and (
      status in ('draft', 'pending_approval')
      or (status = 'scheduled' and scheduled_at is not null)
      or (status = 'sent' and sent_at is not null)
    )
  );

drop policy if exists broadcasts_update_creator on public.broadcasts;

create policy broadcasts_update_creator
  on public.broadcasts
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and status in ('draft', 'scheduled', 'pending_approval')
  )
  with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and public.user_may_broadcast_to_dept(dept_id)
    and (
      public.broadcast_form_allowed(
        status,
        dept_id,
        coalesce(is_org_wide, false),
        coalesce(is_mandatory, false),
        coalesce(is_pinned, false)
      )
      or status = 'cancelled'
    )
  );

create policy broadcasts_update_edit_others
  on public.broadcasts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and created_by is distinct from auth.uid()
    and status in ('draft', 'pending_approval', 'scheduled', 'sent')
    and public.user_has_any_dept_broadcast_permission(auth.uid(), 'edit_others_broadcasts')
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.broadcast_form_allowed(
        status,
        dept_id,
        coalesce(is_org_wide, false),
        coalesce(is_mandatory, false),
        coalesce(is_pinned, false)
      )
      or status = 'cancelled'
    )
  );

drop policy if exists broadcasts_delete_org_admin_draft on public.broadcasts;

create policy broadcasts_delete_org_admin
  on public.broadcasts
  for delete
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

create policy broadcasts_delete_own
  on public.broadcasts
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = broadcasts.org_id
        and p.role in ('manager', 'coordinator', 'org_admin')
        and p.status = 'active'
    )
  );

create policy broadcasts_delete_dept_moderator
  on public.broadcasts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.user_has_dept_broadcast_permission(auth.uid(), dept_id, 'delete_dept_broadcasts')
  );

create policy broadcasts_delete_org_moderator
  on public.broadcasts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.user_has_dept_broadcast_permission(auth.uid(), dept_id, 'delete_org_broadcasts')
  );

-- ---------------------------------------------------------------------------
-- Search: pinned first (matches feed ordering intent)
-- ---------------------------------------------------------------------------

create or replace function public.search_broadcasts(q text, limit_n int default 50)
returns setof public.broadcasts
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.broadcasts b
  where trim(coalesce(q, '')) <> ''
    and b.search_tsv @@ plainto_tsquery('english', trim(q))
    and public.broadcast_visible_to_reader(b)
  order by b.is_pinned desc nulls last, b.sent_at desc nulls last, b.created_at desc
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;
