-- Phase 3: department-scoped visibility + reporting-chain checks for privileged actions.
-- Org admin / org_admin RBAC role / legacy super_admin profile (same org) / platform founder bypass isolation.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_effective_org_admin(p_user_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_org_id is not null
    and (
      public.is_platform_founder(p_user_id)
      or exists (
        select 1
        from public.profiles p
        where p.id = p_user_id
          and p.org_id = p_org_id
          and p.status = 'active'
          and p.role in ('org_admin', 'super_admin')
      )
      or exists (
        select 1
        from public.user_org_role_assignments a
        join public.org_roles r on r.id = a.role_id
        where a.user_id = p_user_id
          and a.org_id = p_org_id
          and r.org_id = p_org_id
          and r.is_archived = false
          and r.key = 'org_admin'
      )
    );
$$;

comment on function public.is_effective_org_admin(uuid, uuid) is
  'Tenant org admin bypass for department isolation: legacy profile role, RBAC org_admin assignment, or platform founder.';

revoke all on function public.is_effective_org_admin(uuid, uuid) from public;
grant execute on function public.is_effective_org_admin(uuid, uuid) to authenticated, service_role;

create or replace function public.viewer_department_ids(p_user_id uuid, p_org_id uuid)
returns table(dept_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ud.dept_id
  from public.user_departments ud
  join public.departments d on d.id = ud.dept_id
  where ud.user_id = p_user_id
    and d.org_id = p_org_id
    and not d.is_archived;
$$;

revoke all on function public.viewer_department_ids(uuid, uuid) from public;
grant execute on function public.viewer_department_ids(uuid, uuid) to authenticated, service_role;

create or replace function public.profile_visible_under_department_isolation(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer is not null
    and p_target is not null
    and (
      p_viewer = p_target
      or exists (
        select 1
        from public.profiles tv
        join public.profiles tt on tt.id = p_target and tt.org_id = tv.org_id
        where tv.id = p_viewer
          and tv.org_id is not null
          and public.is_effective_org_admin(p_viewer, tv.org_id)
      )
      or exists (
        select 1
        from public.profiles tv
        join public.profiles tt on tt.id = p_target and tt.org_id = tv.org_id
        where tv.id = p_viewer
          and tv.status = 'active'
          and exists (
            select 1
            from public.user_departments u1
            join public.user_departments u2
              on u1.dept_id = u2.dept_id
            where u1.user_id = p_viewer
              and u2.user_id = p_target
          )
      )
    );
$$;

comment on function public.profile_visible_under_department_isolation(uuid, uuid) is
  'Row-level visibility: self, effective org admin in org, or shared department membership.';

revoke all on function public.profile_visible_under_department_isolation(uuid, uuid) from public;
grant execute on function public.profile_visible_under_department_isolation(uuid, uuid) to authenticated, service_role;

create or replace function public.is_reports_descendant_in_org(
  p_org_id uuid,
  p_ancestor uuid,
  p_descendant uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_org_id is not null
    and p_ancestor is not null
    and p_descendant is not null
    and p_ancestor is distinct from p_descendant
    and exists (
      with recursive up_chain as (
        select p.id, p.reports_to_user_id, 0 as depth
        from public.profiles p
        where p.id = p_descendant
          and p.org_id = p_org_id
        union all
        select pr.id, pr.reports_to_user_id, uc.depth + 1
        from public.profiles pr
        join up_chain uc on pr.id = uc.reports_to_user_id
        where pr.org_id = p_org_id
          and uc.reports_to_user_id is not null
          and uc.depth < 100
      )
      select 1 from up_chain where id = p_ancestor
    );
$$;

comment on function public.is_reports_descendant_in_org(uuid, uuid, uuid) is
  'True if p_descendant is p_ancestor or reports (transitively) up to p_ancestor within org.';

revoke all on function public.is_reports_descendant_in_org(uuid, uuid, uuid) from public;
grant execute on function public.is_reports_descendant_in_org(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.approver_can_act_on_pending_member(
  p_viewer uuid,
  p_target uuid,
  p_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_effective_org_admin(p_viewer, p_org_id)
    or exists (
      select 1
      from public.user_departments ud_t
      join public.dept_managers dm
        on dm.dept_id = ud_t.dept_id and dm.user_id = p_viewer
      where ud_t.user_id = p_target
    );
$$;

comment on function public.approver_can_act_on_pending_member(uuid, uuid, uuid) is
  'Pending approval: org admin bypass; otherwise viewer must be dept_managers for a department the pending member selected.';

revoke all on function public.approver_can_act_on_pending_member(uuid, uuid, uuid) from public;
grant execute on function public.approver_can_act_on_pending_member(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profiles: replace org-wide select with department isolation
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_same_org on public.profiles;
create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (public.profile_visible_under_department_isolation(auth.uid(), id));

drop policy if exists profiles_update_org_admin on public.profiles;
create policy profiles_update_org_admin
  on public.profiles
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and id <> auth.uid()
    and public.is_effective_org_admin(auth.uid(), profiles.org_id)
  )
  with check (
    org_id = public.current_org_id()
  );

-- ---------------------------------------------------------------------------
-- Departments & structure (authenticated): only own org + own departments unless org admin
-- ---------------------------------------------------------------------------

drop policy if exists departments_select_auth on public.departments;
create policy departments_select_auth
  on public.departments
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.is_effective_org_admin(auth.uid(), departments.org_id)
      or exists (
        select 1
        from public.viewer_department_ids(auth.uid(), departments.org_id) v
        where v.dept_id = departments.id
      )
    )
  );

drop policy if exists user_departments_select on public.user_departments;
create policy user_departments_select
  on public.user_departments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = user_departments.dept_id
        and d.org_id = public.current_org_id()
        and (
          user_departments.user_id = auth.uid()
          or public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = user_departments.dept_id
          )
        )
    )
  );

drop policy if exists dept_managers_select on public.dept_managers;
create policy dept_managers_select
  on public.dept_managers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = dept_managers.dept_id
        and d.org_id = public.current_org_id()
        and (
          public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = dept_managers.dept_id
          )
        )
    )
  );

drop policy if exists user_subscriptions_select on public.user_subscriptions;
create policy user_subscriptions_select
  on public.user_subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.broadcast_channels c
      join public.departments d on d.id = c.dept_id
      where c.id = user_subscriptions.channel_id
        and d.org_id = public.current_org_id()
        and (
          public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = d.id
          )
        )
    )
  );

drop policy if exists broadcast_channels_select_auth on public.broadcast_channels;
create policy broadcast_channels_select_auth
  on public.broadcast_channels
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = broadcast_channels.dept_id
        and d.org_id = public.current_org_id()
        and (
          public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = d.id
          )
        )
    )
  );

drop policy if exists department_teams_select_auth on public.department_teams;
create policy department_teams_select_auth
  on public.department_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = department_teams.dept_id
        and d.org_id = public.current_org_id()
        and (
          public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = d.id
          )
        )
    )
  );

drop policy if exists department_team_members_select_auth on public.department_team_members;
create policy department_team_members_select_auth
  on public.department_team_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      where dt.id = department_team_members.team_id
        and d.org_id = public.current_org_id()
        and (
          public.is_effective_org_admin(auth.uid(), d.org_id)
          or exists (
            select 1
            from public.viewer_department_ids(auth.uid(), d.org_id) v
            where v.dept_id = d.id
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- RBAC tables: narrow role assignment visibility
-- ---------------------------------------------------------------------------

drop policy if exists user_org_role_assignments_select on public.user_org_role_assignments;
create policy user_org_role_assignments_select on public.user_org_role_assignments
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or public.is_effective_org_admin(auth.uid(), org_id)
    or public.profile_visible_under_department_isolation(auth.uid(), user_id)
  )
);

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

drop policy if exists user_permission_overrides_mutate on public.user_permission_overrides;
create policy user_permission_overrides_mutate on public.user_permission_overrides
for all to authenticated
using (
  public.has_current_org_permission('members.edit_roles', '{}'::jsonb)
  and org_id = public.current_org_id()
  and (
    public.is_effective_org_admin(auth.uid(), org_id)
    or public.is_reports_descendant_in_org(org_id, auth.uid(), user_id)
  )
)
with check (
  public.has_current_org_permission('members.edit_roles', '{}'::jsonb)
  and org_id = public.current_org_id()
  and (
    public.is_effective_org_admin(auth.uid(), org_id)
    or public.is_reports_descendant_in_org(org_id, auth.uid(), user_id)
  )
);

drop policy if exists audit_role_events_select on public.audit_role_events;
create policy audit_role_events_select on public.audit_role_events
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.has_current_org_permission('roles.view', '{}'::jsonb)
  and (
    public.is_effective_org_admin(auth.uid(), org_id)
    or target_user_id is null
    or public.profile_visible_under_department_isolation(auth.uid(), target_user_id)
  )
);

drop policy if exists user_departments_org_admin_all on public.user_departments;
create policy user_departments_org_admin_all
  on public.user_departments
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = user_departments.dept_id
        and d.org_id = public.current_org_id()
        and public.is_effective_org_admin(auth.uid(), d.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      where d.id = user_departments.dept_id
        and d.org_id = public.current_org_id()
        and public.is_effective_org_admin(auth.uid(), d.org_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Role assignment + pending approval: hierarchy gate for non–org admin
-- ---------------------------------------------------------------------------

create or replace function public.assign_user_org_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_org_memberships m
    where m.user_id = p_user_id and m.org_id = p_org_id
  ) then
    raise exception 'target user is not a member of this organisation';
  end if;

  if not exists (
    select 1 from public.org_roles r
    where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false
  ) then
    raise exception 'invalid role';
  end if;

  if not public.actor_can_assign_role(auth.uid(), p_org_id, p_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(auth.uid(), p_org_id) then
    if auth.uid() = p_user_id then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if not public.is_reports_descendant_in_org(p_org_id, auth.uid(), p_user_id) then
      raise exception 'role assignment allowed only for direct or indirect reports' using errcode = '42501';
    end if;
  end if;

  delete from public.user_org_role_assignments a
  where a.user_id = p_user_id and a.org_id = p_org_id;

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_user_id, p_org_id, p_role_id, auth.uid());

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), p_user_id, 'role.assigned', jsonb_build_object('role_id', p_role_id));
end;
$$;

create or replace function public.approve_pending_profile(
  p_target uuid,
  p_approve boolean,
  p_rejection_note text default null,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org_id uuid;
  v_trim_role text := nullif(trim(p_role), '');
  v_target_role_id uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = p_target and p.status = 'pending';
  if not found then
    raise exception 'profile not found or not pending';
  end if;

  if not public.has_permission(v_viewer, v_org_id, 'approvals.members.review', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.approver_can_act_on_pending_member(v_viewer, p_target, v_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not p_approve then
    update public.profiles
    set
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = nullif(trim(p_rejection_note), '')
    where id = p_target
      and status = 'pending';
    return;
  end if;

  if v_trim_role is null then
    raise exception 'Choose a role before approving this member';
  end if;

  select r.id
  into v_target_role_id
  from public.org_roles r
  where r.org_id = v_org_id
    and r.key = v_trim_role
    and r.is_archived = false
  limit 1;

  if v_target_role_id is null then
    raise exception 'Invalid role for this organisation';
  end if;

  if not public.actor_can_assign_role(v_viewer, v_org_id, v_target_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  update public.profiles
  set
    status = 'active',
    role = v_trim_role,
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target
    and status = 'pending';

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_target, v_org_id, v_target_role_id, v_viewer)
  on conflict (user_id, org_id, role_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- HR directory RPCs: same visibility as profiles + mask out-of-scope managers
-- ---------------------------------------------------------------------------

create or replace function public.hr_directory_list()
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  avatar_url text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  hr_record_id uuid,
  job_title text,
  grade_level text,
  contract_type text,
  salary_band text,
  fte numeric,
  work_location text,
  employment_start_date date,
  probation_end_date date,
  notice_period_weeks integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return query
  select
    p.id                         as user_id,
    p.full_name::text,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    case
      when p.reports_to_user_id is not null
        and public.profile_visible_under_department_isolation(v_uid, p.reports_to_user_id)
      then p.reports_to_user_id
      else null::uuid
    end                          as reports_to_user_id,
    case
      when p.reports_to_user_id is not null
        and public.profile_visible_under_department_isolation(v_uid, p.reports_to_user_id)
      then m.full_name::text
      else null::text
    end                          as reports_to_name,
    coalesce(
      array_agg(d.name order by d.name) filter (where d.name is not null),
      '{}'::text[]
    )                            as department_names,
    r.id                         as hr_record_id,
    r.job_title::text,
    r.grade_level::text,
    r.contract_type::text,
    r.salary_band::text,
    r.fte,
    r.work_location::text,
    r.employment_start_date,
    r.probation_end_date,
    r.notice_period_weeks
  from public.profiles p
  left join public.profiles m
    on m.id = p.reports_to_user_id
  left join public.user_departments ud
    on ud.user_id = p.id
  left join public.departments d
    on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r
    on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status = 'active'
    and (
      public.is_effective_org_admin(v_uid, v_org)
      or public.profile_visible_under_department_isolation(v_uid, p.id)
    )
  group by p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
           p.reports_to_user_id, m.full_name, r.id, r.job_title, r.grade_level,
           r.contract_type, r.salary_band, r.fte, r.work_location,
           r.employment_start_date, r.probation_end_date, r.notice_period_weeks
  order by p.full_name;
end;
$$;

create or replace function public.hr_employee_file(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  avatar_url text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  hr_record_id uuid,
  job_title text,
  grade_level text,
  contract_type text,
  salary_band text,
  fte numeric,
  work_location text,
  employment_start_date date,
  probation_end_date date,
  notice_period_weeks integer,
  hired_from_application_id uuid,
  notes text,
  record_created_at timestamptz,
  record_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not (
    public.is_effective_org_admin(v_uid, v_org)
    or public.profile_visible_under_department_isolation(v_uid, p_user_id)
  ) then
    raise exception 'not allowed';
  end if;

  return query
  select
    p.id                         as user_id,
    p.full_name::text,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    case
      when p.reports_to_user_id is not null
        and public.profile_visible_under_department_isolation(v_uid, p.reports_to_user_id)
      then p.reports_to_user_id
      else null::uuid
    end                          as reports_to_user_id,
    case
      when p.reports_to_user_id is not null
        and public.profile_visible_under_department_isolation(v_uid, p.reports_to_user_id)
      then m.full_name::text
      else null::text
    end                          as reports_to_name,
    coalesce(
      array_agg(d.name order by d.name) filter (where d.name is not null),
      '{}'::text[]
    )                            as department_names,
    r.id                         as hr_record_id,
    r.job_title::text,
    r.grade_level::text,
    r.contract_type::text,
    r.salary_band::text,
    r.fte,
    r.work_location::text,
    r.employment_start_date,
    r.probation_end_date,
    r.notice_period_weeks,
    r.hired_from_application_id,
    r.notes::text,
    r.created_at                 as record_created_at,
    r.updated_at                 as record_updated_at
  from public.profiles p
  left join public.profiles m
    on m.id = p.reports_to_user_id
  left join public.user_departments ud
    on ud.user_id = p.id
  left join public.departments d
    on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r
    on r.user_id = p.id and r.org_id = v_org
  where p.id = p_user_id
    and p.org_id = v_org
  group by p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
           p.reports_to_user_id, m.full_name,
           r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
           r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
           r.notice_period_weeks, r.hired_from_application_id, r.notes,
           r.created_at, r.updated_at;
end;
$$;
