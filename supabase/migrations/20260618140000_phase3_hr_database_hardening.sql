-- Phase 3: HR database hardening
-- 1) Make DELETE intent explicit across HR tables.
-- 2) Ensure created_by defaults to auth.uid() where clients may insert directly.
-- 3) Keep profiles.role denormalization in sync when role assignments are deleted/changed.

-- ---------------------------------------------------------------------------
-- 3.1 Explicit DELETE policies on HR tables
-- ---------------------------------------------------------------------------

-- employee_hr_records
drop policy if exists employee_hr_records_delete_none on public.employee_hr_records;
create policy employee_hr_records_delete_none
  on public.employee_hr_records
  for delete
  to authenticated
  using (false);

-- employee_hr_record_events
drop policy if exists employee_hr_record_events_delete_none on public.employee_hr_record_events;
create policy employee_hr_record_events_delete_none
  on public.employee_hr_record_events
  for delete
  to authenticated
  using (false);

-- leave_requests
drop policy if exists leave_requests_delete_none on public.leave_requests;
create policy leave_requests_delete_none
  on public.leave_requests
  for delete
  to authenticated
  using (false);

-- leave_allowances
drop policy if exists leave_allowances_delete_none on public.leave_allowances;
create policy leave_allowances_delete_none
  on public.leave_allowances
  for delete
  to authenticated
  using (false);

-- sickness_absences
drop policy if exists sickness_absences_delete_none on public.sickness_absences;
create policy sickness_absences_delete_none
  on public.sickness_absences
  for delete
  to authenticated
  using (false);

-- onboarding_templates:
-- Existing policy onboarding_templates_all used FOR ALL and could permit delete.
drop policy if exists onboarding_templates_all on public.onboarding_templates;
drop policy if exists onboarding_templates_insert on public.onboarding_templates;
drop policy if exists onboarding_templates_update on public.onboarding_templates;

create policy onboarding_templates_insert
  on public.onboarding_templates
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

create policy onboarding_templates_update
  on public.onboarding_templates
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

drop policy if exists onboarding_templates_delete_none on public.onboarding_templates;
create policy onboarding_templates_delete_none
  on public.onboarding_templates
  for delete
  to authenticated
  using (false);

-- onboarding_template_tasks:
-- Existing policy onboarding_template_tasks_all used FOR ALL and could permit delete.
drop policy if exists onboarding_template_tasks_all on public.onboarding_template_tasks;
drop policy if exists onboarding_template_tasks_insert on public.onboarding_template_tasks;
drop policy if exists onboarding_template_tasks_update on public.onboarding_template_tasks;

create policy onboarding_template_tasks_insert
  on public.onboarding_template_tasks
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

create policy onboarding_template_tasks_update
  on public.onboarding_template_tasks
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

drop policy if exists onboarding_template_tasks_delete_none on public.onboarding_template_tasks;
create policy onboarding_template_tasks_delete_none
  on public.onboarding_template_tasks
  for delete
  to authenticated
  using (false);

-- onboarding_runs
drop policy if exists onboarding_runs_delete_none on public.onboarding_runs;
create policy onboarding_runs_delete_none
  on public.onboarding_runs
  for delete
  to authenticated
  using (false);

-- onboarding_run_tasks
drop policy if exists onboarding_run_tasks_delete_none on public.onboarding_run_tasks;
create policy onboarding_run_tasks_delete_none
  on public.onboarding_run_tasks
  for delete
  to authenticated
  using (false);

-- review_cycles:
-- Existing policy review_cycles_manage used FOR ALL and could permit delete.
drop policy if exists review_cycles_manage on public.review_cycles;
drop policy if exists review_cycles_insert_manage on public.review_cycles;
drop policy if exists review_cycles_update_manage on public.review_cycles;

create policy review_cycles_insert_manage
  on public.review_cycles
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
  );

create policy review_cycles_update_manage
  on public.review_cycles
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
  );

drop policy if exists review_cycles_delete_none on public.review_cycles;
create policy review_cycles_delete_none
  on public.review_cycles
  for delete
  to authenticated
  using (false);

-- performance_reviews
drop policy if exists performance_reviews_delete_none on public.performance_reviews;
create policy performance_reviews_delete_none
  on public.performance_reviews
  for delete
  to authenticated
  using (false);

-- review_goals
drop policy if exists review_goals_delete_none on public.review_goals;
create policy review_goals_delete_none
  on public.review_goals
  for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- 3.2 auth.uid() defaults for created_by columns
-- ---------------------------------------------------------------------------

alter table public.review_cycles
  alter column created_by set default auth.uid();

alter table public.onboarding_templates
  alter column created_by set default auth.uid();

alter table public.recruitment_requests
  alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 3.3 profiles.role sync trigger for assignment DELETE/UPDATE/INSERT
-- ---------------------------------------------------------------------------

create or replace function public.sync_profiles_role_from_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_id uuid;
  v_role_key text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_org_id := old.org_id;
  else
    v_user_id := new.user_id;
    v_org_id := new.org_id;
  end if;

  if v_user_id is null or v_org_id is null then
    return coalesce(new, old);
  end if;

  select r.key
    into v_role_key
  from public.user_org_role_assignments a
  join public.org_roles r on r.id = a.role_id
  where a.user_id = v_user_id
    and a.org_id = v_org_id
    and r.is_archived = false
  order by r.rank_level desc nulls last, r.rank_order desc nulls last, a.created_at desc
  limit 1;

  update public.profiles p
  set
    role = coalesce(v_role_key, 'unassigned'),
    updated_at = now()
  where p.id = v_user_id
    and p.org_id = v_org_id
    and p.role is distinct from coalesce(v_role_key, 'unassigned');

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_org_role_assignments_sync_profile_role on public.user_org_role_assignments;
create trigger trg_user_org_role_assignments_sync_profile_role
  after insert or update or delete
  on public.user_org_role_assignments
  for each row
  execute function public.sync_profiles_role_from_assignments();
