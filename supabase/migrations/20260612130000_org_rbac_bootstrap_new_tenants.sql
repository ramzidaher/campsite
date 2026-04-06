-- New organisations created after the RBAC rebuild never received org_roles / org_role_permissions
-- or user_org_role_assignments. has_permission() only checks RBAC tables, so first org admins saw
-- an empty admin UI. Seed system roles + permissions per org (idempotent) and keep profile.role
-- in sync with user_org_role_assignments.

create or replace function public.ensure_org_rbac_bootstrap(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not exists (select 1 from public.organisations o where o.id = p_org_id) then
    return;
  end if;

  insert into public.org_roles (org_id, key, label, description, is_system)
  values
    (p_org_id, 'org_admin', 'Org admin', 'System role migrated from legacy org_admin.', true),
    (p_org_id, 'manager', 'Manager', 'System role migrated from legacy manager.', true),
    (p_org_id, 'coordinator', 'Coordinator', 'System role migrated from legacy coordinator.', true),
    (p_org_id, 'administrator', 'Administrator', 'System role migrated from legacy administrator.', true),
    (p_org_id, 'duty_manager', 'Duty manager', 'System role migrated from legacy duty_manager.', true),
    (p_org_id, 'csa', 'CSA', 'System role migrated from legacy csa.', true),
    (p_org_id, 'society_leader', 'Society leader', 'System role migrated from legacy society_leader.', true)
  on conflict (org_id, key) do nothing;

  insert into public.org_role_permissions (role_id, permission_key)
  select r.id, p.permission_key
  from public.org_roles r
  join (
    values
      ('org_admin', 'members.view'),
      ('org_admin', 'members.invite'),
      ('org_admin', 'members.edit_roles'),
      ('org_admin', 'members.edit_status'),
      ('org_admin', 'members.remove'),
      ('org_admin', 'approvals.members.review'),
      ('org_admin', 'roles.view'),
      ('org_admin', 'roles.manage'),
      ('org_admin', 'departments.manage'),
      ('org_admin', 'teams.manage'),
      ('org_admin', 'broadcasts.compose'),
      ('org_admin', 'broadcasts.publish'),
      ('org_admin', 'broadcasts.publish_without_approval'),
      ('org_admin', 'broadcasts.approve'),
      ('org_admin', 'rota.view'),
      ('org_admin', 'rota.manage'),
      ('org_admin', 'rota.final_approve'),
      ('org_admin', 'discounts.verify_qr'),
      ('org_admin', 'org.settings.manage'),
      ('org_admin', 'integrations.manage'),
      ('org_admin', 'recruitment.manage'),
      ('org_admin', 'jobs.manage'),
      ('org_admin', 'applications.manage'),
      ('org_admin', 'offers.manage'),
      ('org_admin', 'interviews.manage'),
      ('manager', 'members.view'),
      ('manager', 'approvals.members.review'),
      ('manager', 'broadcasts.compose'),
      ('manager', 'broadcasts.publish'),
      ('manager', 'broadcasts.approve'),
      ('manager', 'rota.view'),
      ('manager', 'rota.manage'),
      ('manager', 'rota.final_approve'),
      ('manager', 'discounts.verify_qr'),
      ('coordinator', 'members.view'),
      ('coordinator', 'approvals.members.review'),
      ('coordinator', 'broadcasts.compose'),
      ('coordinator', 'broadcasts.publish'),
      ('coordinator', 'rota.view'),
      ('coordinator', 'rota.manage'),
      ('administrator', 'broadcasts.compose'),
      ('administrator', 'broadcasts.publish'),
      ('administrator', 'broadcasts.publish_without_approval'),
      ('administrator', 'rota.view'),
      ('duty_manager', 'broadcasts.compose'),
      ('duty_manager', 'discounts.verify_qr'),
      ('duty_manager', 'rota.view'),
      ('duty_manager', 'rota.final_approve'),
      ('csa', 'broadcasts.compose'),
      ('csa', 'rota.view'),
      ('society_leader', 'broadcasts.compose'),
      ('society_leader', 'rota.view')
  ) as p(role_key, permission_key)
    on p.role_key = r.key
  where r.org_id = p_org_id
    and r.is_archived = false
  on conflict do nothing;

  insert into public.org_role_permissions (role_id, permission_key)
  select r.id, p.permission_key
  from public.org_roles r
  join (
    values
      ('org_admin', 'leave.submit'),
      ('org_admin', 'leave.view_own'),
      ('org_admin', 'leave.view_direct_reports'),
      ('org_admin', 'leave.approve_direct_reports'),
      ('org_admin', 'leave.manage_org'),
      ('org_admin', 'hr.view_records'),
      ('org_admin', 'hr.manage_records'),
      ('org_admin', 'onboarding.manage_templates'),
      ('org_admin', 'onboarding.manage_runs'),
      ('org_admin', 'onboarding.complete_own_tasks'),
      ('org_admin', 'performance.manage_cycles'),
      ('org_admin', 'performance.view_reports'),
      ('org_admin', 'performance.review_direct_reports'),
      ('org_admin', 'performance.view_own'),
      ('manager', 'leave.submit'),
      ('manager', 'leave.view_own'),
      ('manager', 'leave.view_direct_reports'),
      ('manager', 'leave.approve_direct_reports'),
      ('manager', 'onboarding.complete_own_tasks'),
      ('manager', 'performance.view_own'),
      ('manager', 'performance.review_direct_reports'),
      ('coordinator', 'leave.submit'),
      ('coordinator', 'leave.view_own'),
      ('coordinator', 'leave.view_direct_reports'),
      ('coordinator', 'leave.approve_direct_reports'),
      ('coordinator', 'onboarding.complete_own_tasks'),
      ('coordinator', 'performance.view_own'),
      ('coordinator', 'performance.review_direct_reports'),
      ('administrator', 'leave.submit'),
      ('administrator', 'leave.view_own'),
      ('administrator', 'onboarding.complete_own_tasks'),
      ('administrator', 'performance.view_own'),
      ('duty_manager', 'leave.submit'),
      ('duty_manager', 'leave.view_own'),
      ('duty_manager', 'onboarding.complete_own_tasks'),
      ('duty_manager', 'performance.view_own'),
      ('csa', 'leave.submit'),
      ('csa', 'leave.view_own'),
      ('csa', 'onboarding.complete_own_tasks'),
      ('csa', 'performance.view_own'),
      ('society_leader', 'leave.submit'),
      ('society_leader', 'leave.view_own'),
      ('society_leader', 'onboarding.complete_own_tasks'),
      ('society_leader', 'performance.view_own')
  ) as p(role_key, permission_key)
    on p.role_key = r.key
  where r.org_id = p_org_id
    and r.is_archived = false
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_org_rbac_bootstrap(uuid) from public;

create or replace function public.trg_organisations_ensure_rbac_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_org_rbac_bootstrap(new.id);
  return new;
end;
$$;

drop trigger if exists trg_organisations_ensure_rbac_bootstrap on public.organisations;
create trigger trg_organisations_ensure_rbac_bootstrap
  after insert on public.organisations
  for each row
  execute function public.trg_organisations_ensure_rbac_bootstrap();

create or replace function public.sync_profile_to_org_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text;
  v_role_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.org_id is not null then
      delete from public.user_org_role_assignments
      where user_id = old.id
        and org_id = old.org_id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.org_id is not null and new.org_id is distinct from old.org_id then
    delete from public.user_org_role_assignments
    where user_id = old.id
      and org_id = old.org_id;
  end if;

  if new.org_id is null then
    return new;
  end if;

  if new.role is null or trim(new.role) = '' or new.role = 'unassigned' then
    delete from public.user_org_role_assignments
    where user_id = new.id
      and org_id = new.org_id;
    return new;
  end if;

  v_role_key := case
    when new.role = 'super_admin' then 'org_admin'
    else new.role
  end;

  select r.id
  into v_role_id
  from public.org_roles r
  where r.org_id = new.org_id
    and r.key = v_role_key
    and r.is_archived = false
  limit 1;

  if v_role_id is null then
    return new;
  end if;

  delete from public.user_org_role_assignments
  where user_id = new.id
    and org_id = new.org_id;

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (new.id, new.org_id, v_role_id, null)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_org_role_assignment on public.profiles;
create trigger trg_profiles_sync_org_role_assignment
  after insert or update of org_id, role on public.profiles
  for each row
  execute function public.sync_profile_to_org_role_assignment();

-- One-time: tenants created without system roles (e.g. self-serve org before this migration).
select public.ensure_org_rbac_bootstrap(o.id)
from public.organisations o
where not exists (
  select 1
  from public.org_roles r
  where r.org_id = o.id
    and r.key = 'org_admin'
);

-- One-time: profiles that never got RBAC rows (same pattern as 20260601120000_custom_rbac_rebuild).
insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
select p.id, p.org_id, r.id, null
from public.profiles p
join public.org_roles r
  on r.org_id = p.org_id
 and r.key = case
   when p.role = 'super_admin' then 'org_admin'
   else p.role
 end
where p.org_id is not null
  and p.role is not null
  and p.role <> 'unassigned'
  and not exists (
    select 1
    from public.user_org_role_assignments a
    where a.user_id = p.id
      and a.org_id = p.org_id
  )
on conflict do nothing;

-- Reclaim path updates an existing org row (no insert trigger); ensure RBAC before profile insert.
create or replace function public.apply_registration_from_user_meta(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_org_text text;
  v_full text;
  v_avatar text;
  v_depts jsonb;
  v_subs jsonb;
  dept_count int;
  valid_dept_count int;
  v_create_org_name text;
  v_create_slug_raw text;
  v_slug text;
  v_new_org_id uuid;
  v_dept_id uuid;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  v_avatar := nullif(trim(coalesce(p_meta->>'register_avatar_url', '')), '');
  if v_avatar is not null and length(v_avatar) > 2048 then
    v_avatar := null;
  end if;

  v_org_text := nullif(trim(coalesce(p_meta->>'register_org_id', '')), '');
  v_create_org_name := nullif(trim(coalesce(
    p_meta->>'register_create_org_name',
    p_meta->>'register_founder_org_name',
    ''
  )), '');
  v_create_slug_raw := nullif(trim(coalesce(
    p_meta->>'register_create_org_slug',
    p_meta->>'register_founder_org_slug',
    ''
  )), '');

  v_org := null;
  if v_org_text is not null then
    begin
      v_org := v_org_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid organisation reference in registration';
    end;
  end if;

  if v_org is not null and v_create_org_name is not null and v_create_slug_raw is not null then
    raise exception 'Invalid registration: choose either joining an organisation or creating one, not both';
  end if;

  if v_create_org_name is not null and v_create_slug_raw is not null then
    if length(v_create_org_name) > 120 or length(v_create_org_name) < 1 then
      raise exception 'Organisation name must be between 1 and 120 characters';
    end if;

    v_slug := lower(v_create_slug_raw);
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '-+', '-', 'g');
    v_slug := trim(both '-' from v_slug);

    if length(v_slug) < 2 or length(v_slug) > 63 then
      raise exception 'Choose a URL slug between 2 and 63 characters (lowercase letters, numbers, hyphens)';
    end if;

    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Choose a URL slug using lowercase letters, numbers, and hyphens only';
    end if;

    v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

    select o.id into v_new_org_id
    from public.organisations o
    where o.slug = v_slug
    limit 1;

    if v_new_org_id is not null then
      if exists (
        select 1
        from public.profiles p
        where p.org_id = v_new_org_id
      ) then
        raise exception 'That organisation URL is already taken. Choose a different slug';
      end if;

      update public.organisations
      set name = v_create_org_name
      where id = v_new_org_id;

      perform public.ensure_org_rbac_bootstrap(v_new_org_id);

      select d.id into v_dept_id
      from public.departments d
      where d.org_id = v_new_org_id and d.is_archived = false
      order by d.created_at asc
      limit 1;

      if v_dept_id is null then
        insert into public.departments (org_id, name, type, is_archived)
        values (v_new_org_id, 'General', 'department', false)
        returning id into v_dept_id;
      end if;

      insert into public.profiles (id, org_id, full_name, email, role, status, avatar_url)
      values (p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active', v_avatar);

      insert into public.user_departments (user_id, dept_id)
      values (p_user_id, v_dept_id);

      return;
    end if;

    insert into public.organisations (name, slug, is_active)
    values (v_create_org_name, v_slug, true)
    returning id into v_new_org_id;

    insert into public.departments (org_id, name, type, is_archived)
    values (v_new_org_id, 'General', 'department', false)
    returning id into v_dept_id;

    insert into public.profiles (id, org_id, full_name, email, role, status, avatar_url)
    values (p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active', v_avatar);

    insert into public.user_departments (user_id, dept_id)
    values (p_user_id, v_dept_id);

    return;
  end if;

  if v_org is null then
    return;
  end if;

  if not exists (
    select 1 from public.organisations o where o.id = v_org and o.is_active = true
  ) then
    raise exception 'Invalid organisation for registration';
  end if;

  v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

  begin
    v_depts := (p_meta->>'register_dept_ids')::jsonb;
  exception
    when others then
      raise exception 'Invalid registration department data';
  end;

  if v_depts is null or jsonb_typeof(v_depts) <> 'array' or jsonb_array_length(v_depts) = 0 then
    raise exception 'Select at least one team';
  end if;

  select count(*)::int into dept_count from jsonb_array_elements_text(v_depts) q(did);

  select count(*)::int into valid_dept_count
  from jsonb_array_elements_text(v_depts) q(did)
  join public.departments d on d.id = q.did::uuid
  where d.org_id = v_org and d.is_archived = false;

  if valid_dept_count <> dept_count then
    raise exception 'Invalid department for registration';
  end if;

  insert into public.profiles (id, org_id, full_name, email, role, status, avatar_url)
  values (p_user_id, v_org, v_full, nullif(trim(p_email), ''), 'unassigned', 'pending', v_avatar);

  insert into public.user_departments (user_id, dept_id)
  select p_user_id, q.did::uuid
  from jsonb_array_elements_text(v_depts) q(did);

  begin
    v_subs := coalesce((p_meta->>'register_subscriptions')::jsonb, '[]'::jsonb);
  exception
    when others then
      v_subs := '[]'::jsonb;
  end;

  if jsonb_typeof(v_subs) = 'array' and jsonb_array_length(v_subs) > 0 then
    insert into public.user_subscriptions (user_id, channel_id, subscribed)
    select
      p_user_id,
      (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid,
      coalesce((s.item->>'subscribed')::boolean, true)
    from jsonb_array_elements(v_subs) s(item)
    where nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), '') is not null
      and exists (
        select 1
        from public.broadcast_channels c
        join public.departments d on d.id = c.dept_id
        where c.id = (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid
          and d.org_id = v_org
          and d.is_archived = false
          and d.id in (select q.did::uuid from jsonb_array_elements_text(v_depts) q(did))
      );
  end if;
end;
$$;
