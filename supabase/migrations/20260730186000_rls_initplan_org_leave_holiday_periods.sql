-- RLS initplan optimization: avoid per-row auth function evaluation.

drop policy if exists leave_holidays_manage_org_admins
  on public.org_leave_holiday_periods;

create policy leave_holidays_manage_org_admins
  on public.org_leave_holiday_periods
  for all
  to authenticated
  using (
    has_permission((select auth.uid()), org_id, 'leave.manage_org'::text, '{}'::jsonb)
  )
  with check (
    has_permission((select auth.uid()), org_id, 'leave.manage_org'::text, '{}'::jsonb)
  );

drop policy if exists leave_holidays_select_active_org_members
  on public.org_leave_holiday_periods;

create policy leave_holidays_select_active_org_members
  on public.org_leave_holiday_periods
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.org_id = org_leave_holiday_periods.org_id
        and p.status = 'active'
    )
  );
