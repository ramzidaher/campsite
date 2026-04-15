-- Optimize permission hydration for shell layout.
-- Previous version called has_permission() once per permission_catalog row.
-- This set-based rewrite computes granted permissions in bulk.

create or replace function public.get_my_permissions(p_org_id uuid default null)
returns table(permission_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := coalesce(p_org_id, public.current_org_id());
  v_founder boolean := false;
  v_member_active boolean := false;
  v_replace_mode boolean := false;
begin
  if v_uid is null or v_org is null then
    return;
  end if;

  select public.is_platform_founder(v_uid) into v_founder;
  if v_founder then
    return query
    select pc.key
    from public.permission_catalog pc;
    return;
  end if;

  select exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = v_uid
      and m.org_id = v_org
      and m.status = 'active'
  ) into v_member_active;

  if not v_member_active then
    return;
  end if;

  select exists (
    select 1
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode = 'replace'
  ) into v_replace_mode;

  return query
  with latest_policy as (
    select distinct on (opp.permission_key)
      opp.permission_key,
      coalesce((opp.rule ->> 'requires_approval')::boolean, false) as requires_approval
    from public.org_permission_policies opp
    where opp.org_id = v_org
      and opp.is_active = true
    order by opp.permission_key, opp.created_at desc
  ),
  subtractive as (
    select o.permission_key
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode = 'subtractive'
  ),
  additive_or_replace as (
    select o.permission_key
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode in ('additive', 'replace')
  ),
  role_grants as (
    select rp.permission_key
    from public.user_org_role_assignments a
    join public.org_roles r
      on r.id = a.role_id
    join public.org_role_permissions rp
      on rp.role_id = r.id
    where a.user_id = v_uid
      and a.org_id = v_org
      and r.org_id = v_org
      and r.is_archived = false
  ),
  granted_raw as (
    -- replace mode ignores role grants and only uses explicit overrides.
    select ar.permission_key
    from additive_or_replace ar
    where v_replace_mode
    union
    -- normal mode uses role grants plus additive overrides.
    select rg.permission_key
    from role_grants rg
    where not v_replace_mode
    union
    select ar.permission_key
    from additive_or_replace ar
    where not v_replace_mode
  )
  select pc.key
  from granted_raw g
  join public.permission_catalog pc
    on pc.key = g.permission_key
  left join subtractive s
    on s.permission_key = g.permission_key
  left join latest_policy lp
    on lp.permission_key = g.permission_key
  where s.permission_key is null
    and coalesce(pc.is_founder_only, false) = false
    and coalesce(lp.requires_approval, false) = false
  group by pc.key;
end;
$$;

grant execute on function public.get_my_permissions(uuid) to authenticated;
