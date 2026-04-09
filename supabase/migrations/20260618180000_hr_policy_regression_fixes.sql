-- Fix regressions introduced during HR hardening:
-- 1) Restore SELECT visibility for onboarding_template_tasks.
-- 2) Restore review_cycles visibility for HR users with cycle/report permissions.
-- 3) Allow onboarding_run_tasks inserts for onboarding.manage_runs (UI adds ad-hoc tasks).

-- ---------------------------------------------------------------------------
-- onboarding_template_tasks SELECT
-- ---------------------------------------------------------------------------

drop policy if exists onboarding_template_tasks_select on public.onboarding_template_tasks;
create policy onboarding_template_tasks_select
  on public.onboarding_template_tasks
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

-- ---------------------------------------------------------------------------
-- review_cycles SELECT (for HR manage/report viewers)
-- ---------------------------------------------------------------------------

drop policy if exists review_cycles_select_manage_or_view on public.review_cycles;
create policy review_cycles_select_manage_or_view
  on public.review_cycles
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'performance.view_reports', '{}'::jsonb)
    )
  );

-- ---------------------------------------------------------------------------
-- onboarding_run_tasks INSERT (manual ad-hoc task creation by HR)
-- ---------------------------------------------------------------------------

drop policy if exists onboarding_run_tasks_insert_manage on public.onboarding_run_tasks;
create policy onboarding_run_tasks_insert_manage
  on public.onboarding_run_tasks
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
    and exists (
      select 1
      from public.onboarding_runs r
      where r.id = run_id
        and r.org_id = public.current_org_id()
    )
  );
