-- Legacy `super_admin` profiles: same calendar + org-wide rota access as `org_admin` (matches `isOrgAdminRole` / `canManageCalendarManualEvents`).

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
  if r in ('org_admin', 'super_admin') then
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
          and p.role in ('org_admin', 'super_admin')
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
            and p.role in ('org_admin', 'super_admin')
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
            and p.role in ('org_admin', 'super_admin')
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
            and p.role in ('org_admin', 'super_admin')
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
            and p.role in ('org_admin', 'super_admin')
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
        and p.role in ('org_admin', 'super_admin', 'manager')
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
          and p.role in ('org_admin', 'super_admin', 'manager')
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
          and p.role in ('org_admin', 'super_admin', 'manager')
      )
    )
  );
