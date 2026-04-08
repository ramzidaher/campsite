-- Phase 4: per-user permission overrides (additive / subtractive / full replacement).
--
-- IMPLEMENTATION CHOICE (both additive/subtractive and full replace are supported):
-- - additive:   grants a permission key on top of the user's role (or on top of the replace allowlist).
-- - subtractive: removes a key even if the role (or replace allowlist) would grant it. Subtractive wins.
-- - replace:     when at least one `replace` row exists for (user_id, org_id), role-derived permissions are
--                ignored for checks; the user is treated as if they may only hold keys listed in `replace`
--                rows plus any `additive` rows (still subject to subtractive).
-- Why this shape: `user_permission_overrides` already existed with these three modes; composing subtractive
-- after allowlist keeps rules intuitive; replace is opt-in per user via presence of rows (no extra flag).
--
-- DOCUMENTED EXAMPLES (conceptual — keys depend on your catalog):
-- 1) Onboarding-limited manager: A user keeps the Manager role but must not access integration settings until
--    a start-date rule is enforced in product; use subtractive `integrations.manage` (and related keys) so
--    the role template stays standard while this individual is tightened. (Broader “data before start date”
--    row-level rules can be layered later via permission_catalog + RLS; overrides remove capability now.)
-- 2) Temporary recruiting access: Add additive `recruitment.view` + `jobs.view` for two weeks for a team lead
--    without cloning the Manager role or editing org_role_permissions for everyone.
-- 3) Restricted contractor / interim role: Use `replace` rows to list only the exact allowlist (e.g.
--    `leave.view_own`, `leave.submit`, `broadcasts.view`) so every other permission from a broadly seeded role
--    is ignored until replace rows are cleared with `user_permission_overrides_clear_for_user`.
--
-- Enforcement elsewhere: Phase 3 hierarchy applies (mutate RLS + RPC checks); actors cannot grant keys they
--   do not themselves hold (except platform founder / effective org admin bypass for grant capability check).

-- ---------------------------------------------------------------------------
-- Effective permission evaluation
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(
  p_user_id uuid,
  p_org_id uuid,
  p_permission_key text,
  p_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_founder boolean := false;
  v_member_active boolean := false;
  v_subtractive boolean := false;
  v_replace_mode boolean := false;
  v_granted boolean := false;
  v_requires_approval boolean := false;
  v_founder_only boolean := false;
begin
  if p_user_id is null or p_org_id is null or coalesce(trim(p_permission_key), '') = '' then
    return false;
  end if;

  select public.is_platform_founder(p_user_id) into v_founder;
  if v_founder then
    return true;
  end if;

  select exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = p_user_id
      and m.org_id = p_org_id
      and m.status = 'active'
  ) into v_member_active;

  if not v_member_active then
    return false;
  end if;

  if not exists (select 1 from public.permission_catalog c where c.key = p_permission_key) then
    return false;
  end if;

  select exists (
    select 1
    from public.user_permission_overrides o
    where o.user_id = p_user_id
      and o.org_id = p_org_id
      and o.mode = 'subtractive'
      and o.permission_key = p_permission_key
  ) into v_subtractive;

  if v_subtractive then
    return false;
  end if;

  select exists (
    select 1
    from public.user_permission_overrides o
    where o.user_id = p_user_id
      and o.org_id = p_org_id
      and o.mode = 'replace'
  ) into v_replace_mode;

  if v_replace_mode then
    select exists (
      select 1
      from public.user_permission_overrides o
      where o.user_id = p_user_id
        and o.org_id = p_org_id
        and o.permission_key = p_permission_key
        and o.mode in ('replace', 'additive')
    ) into v_granted;
  else
    select exists (
      select 1
      from public.user_org_role_assignments a
      join public.org_roles r on r.id = a.role_id
      join public.org_role_permissions rp on rp.role_id = r.id
      where a.user_id = p_user_id
        and a.org_id = p_org_id
        and r.org_id = p_org_id
        and r.is_archived = false
        and rp.permission_key = p_permission_key
    ) into v_granted;

    if not v_granted then
      select exists (
        select 1
        from public.user_permission_overrides o
        where o.user_id = p_user_id
          and o.org_id = p_org_id
          and o.mode = 'additive'
          and o.permission_key = p_permission_key
      ) into v_granted;
    end if;
  end if;

  if not v_granted then
    return false;
  end if;

  select pc.is_founder_only
  into v_founder_only
  from public.permission_catalog pc
  where pc.key = p_permission_key;

  if coalesce(v_founder_only, false) then
    return false;
  end if;

  select coalesce((opp.rule ->> 'requires_approval')::boolean, false)
  into v_requires_approval
  from public.org_permission_policies opp
  where opp.org_id = p_org_id
    and opp.permission_key = p_permission_key
    and opp.is_active = true
  order by opp.created_at desc
  limit 1;

  if v_requires_approval and coalesce((p_context ->> 'approved')::boolean, false) = false then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.get_my_permissions(p_org_id uuid default null)
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.key
  from public.permission_catalog pc
  where public.has_permission(auth.uid(), coalesce(p_org_id, public.current_org_id()), pc.key, '{}'::jsonb)
    and (
      not pc.is_founder_only
      or public.is_platform_founder(auth.uid())
    );
$$;

-- ---------------------------------------------------------------------------
-- RPCs: apply overrides with hierarchy + “cannot exceed actor” rules
-- ---------------------------------------------------------------------------

create or replace function public.user_permission_override_upsert(
  p_org_id uuid,
  p_target_user_id uuid,
  p_mode text,
  p_permission_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_key text := trim(coalesce(p_permission_key, ''));
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_id uuid;
  v_can_manage boolean := false;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if v_key = '' then
    raise exception 'permission_key required';
  end if;

  if v_mode not in ('additive', 'subtractive', 'replace') then
    raise exception 'invalid mode';
  end if;

  if not exists (select 1 from public.permission_catalog c where c.key = v_key) then
    raise exception 'unknown permission_key';
  end if;

  v_can_manage :=
    public.has_permission(v_actor, p_org_id, 'members.edit_roles', '{}'::jsonb)
    or public.has_permission(v_actor, p_org_id, 'roles.manage', '{}'::jsonb);

  if not v_can_manage then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_org_id is null or p_org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(v_actor, p_org_id)
     and not public.is_reports_descendant_in_org(p_org_id, v_actor, p_target_user_id) then
    raise exception 'overrides may only target direct or indirect reports' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_org_memberships m
    where m.user_id = p_target_user_id and m.org_id = p_org_id and m.status = 'active'
  ) then
    raise exception 'target is not an active member of this organisation';
  end if;

  if not public.is_platform_founder(v_actor)
     and not public.is_effective_org_admin(v_actor, p_org_id)
     and not public.has_permission(v_actor, p_org_id, v_key, '{}'::jsonb) then
    raise exception 'cannot grant or revoke a permission you do not hold' using errcode = '42501';
  end if;

  insert into public.user_permission_overrides (
    org_id, user_id, mode, permission_key, created_by
  )
  values (p_org_id, p_target_user_id, v_mode, v_key, v_actor)
  on conflict (org_id, user_id, mode, permission_key) do update
  set created_by = v_actor, created_at = now()
  returning id into v_id;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (
    p_org_id,
    v_actor,
    p_target_user_id,
    'permission.override_upsert',
    jsonb_build_object(
      'override_id', v_id,
      'mode', v_mode,
      'permission_key', v_key
    )
  );

  return v_id;
end;
$$;

create or replace function public.user_permission_override_delete(
  p_org_id uuid,
  p_target_user_id uuid,
  p_mode text,
  p_permission_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_key text := trim(coalesce(p_permission_key, ''));
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_can_manage boolean := false;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if v_key = '' or v_mode not in ('additive', 'subtractive', 'replace') then
    raise exception 'invalid arguments';
  end if;

  v_can_manage :=
    public.has_permission(v_actor, p_org_id, 'members.edit_roles', '{}'::jsonb)
    or public.has_permission(v_actor, p_org_id, 'roles.manage', '{}'::jsonb);

  if not v_can_manage then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_org_id is null or p_org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(v_actor, p_org_id)
     and not public.is_reports_descendant_in_org(p_org_id, v_actor, p_target_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.is_platform_founder(v_actor)
     and not public.is_effective_org_admin(v_actor, p_org_id)
     and not public.has_permission(v_actor, p_org_id, v_key, '{}'::jsonb) then
    raise exception 'cannot remove an override for a permission you do not hold' using errcode = '42501';
  end if;

  delete from public.user_permission_overrides o
  where o.org_id = p_org_id
    and o.user_id = p_target_user_id
    and o.mode = v_mode
    and o.permission_key = v_key;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (
    p_org_id,
    v_actor,
    p_target_user_id,
    'permission.override_delete',
    jsonb_build_object('mode', v_mode, 'permission_key', v_key)
  );
end;
$$;

create or replace function public.user_permission_overrides_clear_for_user(
  p_org_id uuid,
  p_target_user_id uuid,
  p_modes text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_can_manage boolean := false;
  v_modes text[] := coalesce(p_modes, array['additive', 'subtractive', 'replace']::text[]);
  v_mode text;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  v_can_manage :=
    public.has_permission(v_actor, p_org_id, 'members.edit_roles', '{}'::jsonb)
    or public.has_permission(v_actor, p_org_id, 'roles.manage', '{}'::jsonb);

  if not v_can_manage then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_org_id is null or p_org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(v_actor, p_org_id)
     and not public.is_reports_descendant_in_org(p_org_id, v_actor, p_target_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  foreach v_mode in array v_modes
  loop
    if lower(trim(v_mode)) not in ('additive', 'subtractive', 'replace') then
      raise exception 'invalid mode in array';
    end if;
  end loop;

  delete from public.user_permission_overrides o
  where o.org_id = p_org_id
    and o.user_id = p_target_user_id
    and o.mode in (select lower(trim(m)) from unnest(v_modes) as u(m));

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (
    p_org_id,
    v_actor,
    p_target_user_id,
    'permission.override_clear',
    jsonb_build_object('modes', v_modes)
  );
end;
$$;

revoke all on function public.user_permission_override_upsert(uuid, uuid, text, text) from public;
grant execute on function public.user_permission_override_upsert(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.user_permission_override_delete(uuid, uuid, text, text) from public;
grant execute on function public.user_permission_override_delete(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.user_permission_overrides_clear_for_user(uuid, uuid, text[]) from public;
grant execute on function public.user_permission_overrides_clear_for_user(uuid, uuid, text[]) to authenticated, service_role;

comment on table public.user_permission_overrides is
  'Per-user permission overrides. Three modes (see Phase 4 migration header): additive grants, subtractive revokes, '
  'replace switches the user to an explicit allowlist (role grants ignored until all replace rows are removed). '
  'Prefer RPCs user_permission_override_upsert / _delete / _clear_for_user so hierarchy and actor-cap checks apply.';

-- ---------------------------------------------------------------------------
-- RLS: who may mutate rows (RPC + direct SQL); allow roles.manage or members.edit_roles
-- ---------------------------------------------------------------------------

drop policy if exists user_permission_overrides_mutate on public.user_permission_overrides;
create policy user_permission_overrides_mutate on public.user_permission_overrides
for all to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_current_org_permission('members.edit_roles', '{}'::jsonb)
    or public.has_current_org_permission('roles.manage', '{}'::jsonb)
  )
  and (
    public.is_effective_org_admin(auth.uid(), org_id)
    or public.is_reports_descendant_in_org(org_id, auth.uid(), user_id)
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_current_org_permission('members.edit_roles', '{}'::jsonb)
    or public.has_current_org_permission('roles.manage', '{}'::jsonb)
  )
  and (
    public.is_effective_org_admin(auth.uid(), org_id)
    or public.is_reports_descendant_in_org(org_id, auth.uid(), user_id)
  )
);

-- Viewing overrides: anyone who can view the target profile under Phase 3 isolation
drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or public.is_effective_org_admin(auth.uid(), org_id)
    or public.profile_visible_under_department_isolation(auth.uid(), user_id)
  )
);

revoke all on function public.has_permission(uuid, uuid, text, jsonb) from public;
grant execute on function public.has_permission(uuid, uuid, text, jsonb) to authenticated, service_role;

revoke all on function public.get_my_permissions(uuid) from public;
grant execute on function public.get_my_permissions(uuid) to authenticated, service_role;

-- Enforce “actor holds permission_key” on direct table writes (RLS cannot see NEW.permission_key vs actor caps).
create or replace function public.user_permission_overrides_enforce_actor_holds_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_key text;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    v_org := new.org_id;
    v_key := new.permission_key;
  else
    v_org := old.org_id;
    v_key := old.permission_key;
  end if;

  if public.is_platform_founder(auth.uid())
     or public.is_effective_org_admin(auth.uid(), v_org) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if not public.has_permission(auth.uid(), v_org, v_key, '{}'::jsonb) then
    raise exception 'cannot modify override for a permission you do not hold' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists user_permission_overrides_actor_key_trg on public.user_permission_overrides;
create trigger user_permission_overrides_actor_key_trg
before insert or update or delete on public.user_permission_overrides
for each row
execute procedure public.user_permission_overrides_enforce_actor_holds_key();
