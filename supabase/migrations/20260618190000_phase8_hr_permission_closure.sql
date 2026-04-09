-- Phase 8: HR permission closure
-- - Allow managers with hr.view_direct_reports to view onboarding runs/tasks for direct reports.
-- - Allow those managers to complete manager-assigned onboarding tasks.

-- ---------------------------------------------------------------------------
-- RLS: onboarding_runs / onboarding_run_tasks manager read access
-- ---------------------------------------------------------------------------

drop policy if exists onboarding_runs_select_direct_reports on public.onboarding_runs;
create policy onboarding_runs_select_direct_reports
  on public.onboarding_runs for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1
      from public.employee_hr_records ehr
      where ehr.org_id = onboarding_runs.org_id
        and ehr.user_id = onboarding_runs.user_id
        and ehr.reports_to_user_id = auth.uid()
    )
  );

drop policy if exists onboarding_run_tasks_select_direct_reports on public.onboarding_run_tasks;
create policy onboarding_run_tasks_select_direct_reports
  on public.onboarding_run_tasks for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1
      from public.onboarding_runs r
      join public.employee_hr_records ehr
        on ehr.org_id = r.org_id
       and ehr.user_id = r.user_id
      where r.id = onboarding_run_tasks.run_id
        and ehr.reports_to_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: onboarding_task_update
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_task_update(
  p_task_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_run public.onboarding_runs;
  v_task public.onboarding_run_tasks;
  v_is_direct_manager boolean := false;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('completed', 'skipped', 'pending') then raise exception 'invalid status'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_task from public.onboarding_run_tasks where id = p_task_id and org_id = v_org;
  if v_task.id is null then raise exception 'task not found'; end if;

  select * into v_run from public.onboarding_runs where id = v_task.run_id;

  select exists (
    select 1
    from public.employee_hr_records ehr
    where ehr.org_id = v_org
      and ehr.user_id = v_run.user_id
      and ehr.reports_to_user_id = v_uid
  ) into v_is_direct_manager;

  if not (
    public.has_permission(v_uid, v_org, 'onboarding.manage_runs', '{}'::jsonb)
    or (
      v_run.user_id = v_uid
      and v_task.assignee_type = 'employee'
      and public.has_permission(v_uid, v_org, 'onboarding.complete_own_tasks', '{}'::jsonb)
    )
    or (
      v_task.assignee_type = 'manager'
      and v_is_direct_manager
      and public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb)
    )
  ) then
    raise exception 'not allowed';
  end if;

  update public.onboarding_run_tasks set
    status = p_status,
    completed_at = case when p_status in ('completed', 'skipped') then now() else null end,
    completed_by = case when p_status in ('completed', 'skipped') then v_uid else null end
  where id = p_task_id;

  if p_status in ('completed', 'skipped') then
    if not exists (
      select 1 from public.onboarding_run_tasks
      where run_id = v_run.id and status = 'pending'
    ) then
      update public.onboarding_runs
      set status = 'completed', completed_at = now()
      where id = v_run.id and status = 'active';
    end if;
  else
    update public.onboarding_runs
    set status = 'active', completed_at = null
    where id = v_run.id and status = 'completed';
  end if;
end;
$$;
