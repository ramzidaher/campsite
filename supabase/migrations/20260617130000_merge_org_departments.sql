-- Merge two departments in the same organisation: repoint FKs, merge channels/teams on name
-- collision, then delete the source department. Gated on org admin / departments.manage.

create or replace function public.merge_org_departments(
  p_source_dept_id uuid,
  p_target_dept_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_org uuid;
  v_src_org uuid;
  v_tgt_org uuid;
  r_channel record;
  v_tgt_channel uuid;
  r_team record;
  v_tgt_team uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if p_source_dept_id is null
    or p_target_dept_id is null
    or p_source_dept_id = p_target_dept_id
  then
    raise exception 'invalid department ids';
  end if;

  select d.org_id into v_src_org from public.departments d where d.id = p_source_dept_id;
  select d.org_id into v_tgt_org from public.departments d where d.id = p_target_dept_id;

  if v_src_org is null or v_tgt_org is null or v_src_org <> v_tgt_org then
    raise exception 'departments must exist in the same organisation';
  end if;

  v_org := v_src_org;

  if not (
    public.is_effective_org_admin(v_actor, v_org)
    or public.has_permission(v_actor, v_org, 'departments.manage', '{}'::jsonb)
  ) then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1
    from public.departments d
    where d.id = p_target_dept_id
      and d.is_archived
  ) then
    raise exception 'cannot merge into an archived department';
  end if;

  -- Broadcast channels: merge by name into target dept
  for r_channel in
    select c.id, c.name
    from public.broadcast_channels c
    where c.dept_id = p_source_dept_id
  loop
    select c2.id
    into v_tgt_channel
    from public.broadcast_channels c2
    where c2.dept_id = p_target_dept_id
      and c2.name = r_channel.name;

    if v_tgt_channel is not null then
      update public.broadcasts b
      set
        channel_id = v_tgt_channel,
        dept_id = p_target_dept_id
      where b.channel_id = r_channel.id;

      insert into public.user_subscriptions (user_id, channel_id, subscribed)
      select us.user_id, v_tgt_channel, us.subscribed
      from public.user_subscriptions us
      where us.channel_id = r_channel.id
      on conflict (user_id, channel_id)
      do update set
        subscribed = public.user_subscriptions.subscribed or excluded.subscribed;

      delete from public.user_subscriptions us where us.channel_id = r_channel.id;
      delete from public.broadcast_channels c where c.id = r_channel.id;
    else
      update public.broadcast_channels c
      set dept_id = p_target_dept_id
      where c.id = r_channel.id;
    end if;
  end loop;

  update public.broadcasts b
  set dept_id = p_target_dept_id
  where b.dept_id = p_source_dept_id;

  delete from public.broadcast_collab_departments bcd1
  using public.broadcast_collab_departments bcd2
  where bcd1.broadcast_id = bcd2.broadcast_id
    and bcd1.dept_id = p_source_dept_id
    and bcd2.dept_id = p_target_dept_id;

  update public.broadcast_collab_departments bcd
  set dept_id = p_target_dept_id
  where bcd.dept_id = p_source_dept_id;

  delete from public.broadcast_collab_departments bcd
  using public.broadcasts b
  where bcd.broadcast_id = b.id
    and bcd.dept_id = b.dept_id;

  -- Teams: merge by name; repoint broadcasts and rota team links
  for r_team in
    select t.id, t.name
    from public.department_teams t
    where t.dept_id = p_source_dept_id
  loop
    select t2.id
    into v_tgt_team
    from public.department_teams t2
    where t2.dept_id = p_target_dept_id
      and t2.name = r_team.name;

    if v_tgt_team is not null then
      update public.broadcasts br
      set team_id = v_tgt_team
      where br.team_id = r_team.id;

      update public.rotas r
      set department_team_id = v_tgt_team
      where r.department_team_id = r_team.id;

      insert into public.department_team_members (user_id, team_id)
      select m.user_id, v_tgt_team
      from public.department_team_members m
      where m.team_id = r_team.id
      on conflict (user_id, team_id) do nothing;

      delete from public.department_team_members m where m.team_id = r_team.id;
      delete from public.department_teams t where t.id = r_team.id;
    else
      update public.department_teams t
      set dept_id = p_target_dept_id
      where t.id = r_team.id;
    end if;
  end loop;

  delete from public.user_departments ud1
  using public.user_departments ud2
  where ud1.user_id = ud2.user_id
    and ud1.dept_id = p_source_dept_id
    and ud2.dept_id = p_target_dept_id;

  update public.user_departments ud
  set dept_id = p_target_dept_id
  where ud.dept_id = p_source_dept_id;

  delete from public.dept_managers dm1
  using public.dept_managers dm2
  where dm1.user_id = dm2.user_id
    and dm1.dept_id = p_source_dept_id
    and dm2.dept_id = p_target_dept_id;

  update public.dept_managers dm
  set dept_id = p_target_dept_id
  where dm.dept_id = p_source_dept_id;

  insert into public.dept_broadcast_permissions (
    dept_id,
    permission,
    min_role,
    granted_by,
    granted_at
  )
  select
    p_target_dept_id,
    dbp.permission,
    dbp.min_role,
    dbp.granted_by,
    dbp.granted_at
  from public.dept_broadcast_permissions dbp
  where dbp.dept_id = p_source_dept_id
  on conflict (dept_id, permission) do nothing;

  delete from public.dept_broadcast_permissions dbp
  where dbp.dept_id = p_source_dept_id;

  update public.recruitment_requests rr
  set department_id = p_target_dept_id
  where rr.department_id = p_source_dept_id;

  update public.job_listings jl
  set department_id = p_target_dept_id
  where jl.department_id = p_source_dept_id;

  update public.job_applications ja
  set department_id = p_target_dept_id
  where ja.department_id = p_source_dept_id;

  update public.rotas r
  set dept_id = p_target_dept_id
  where r.dept_id = p_source_dept_id;

  update public.rota_shifts s
  set dept_id = p_target_dept_id
  where s.dept_id = p_source_dept_id;

  update public.calendar_events e
  set dept_id = p_target_dept_id
  where e.dept_id = p_source_dept_id;

  delete from public.departments d where d.id = p_source_dept_id;
end;
$$;

comment on function public.merge_org_departments(uuid, uuid) is
  'Org admin / departments.manage: merge p_source into p_target (same org), then delete source.';

revoke all on function public.merge_org_departments(uuid, uuid) from public;
grant execute on function public.merge_org_departments(uuid, uuid) to authenticated, service_role;
