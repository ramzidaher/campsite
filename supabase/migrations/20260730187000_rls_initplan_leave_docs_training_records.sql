-- Advisor-driven RLS initplan optimization batch.
-- Scope: leave_request_documents + employee_training_records.

drop policy if exists employee_training_records_select on public.employee_training_records;
create policy employee_training_records_select
  on public.employee_training_records
  for select
  to authenticated
  using (
    (org_id = current_org_id())
    and (
      has_permission((select auth.uid()), org_id, 'hr.view_records'::text, '{}'::jsonb)
      or (
        has_permission((select auth.uid()), org_id, 'hr.view_direct_reports'::text, '{}'::jsonb)
        and exists (
          select 1
          from public.profiles p
          where p.id = employee_training_records.user_id
            and p.org_id = p.org_id
            and not (p.reports_to_user_id is distinct from (select auth.uid()))
        )
      )
      or (
        (user_id = (select auth.uid()))
        and has_permission((select auth.uid()), org_id, 'hr.view_own'::text, '{}'::jsonb)
      )
    )
  );

drop policy if exists employee_training_records_insert on public.employee_training_records;
create policy employee_training_records_insert
  on public.employee_training_records
  for insert
  to authenticated
  with check (
    (org_id = current_org_id())
    and (
      has_permission((select auth.uid()), org_id, 'hr.manage_records'::text, '{}'::jsonb)
      or (
        (user_id = (select auth.uid()))
        and has_permission((select auth.uid()), org_id, 'hr.view_own'::text, '{}'::jsonb)
      )
    )
  );

drop policy if exists employee_training_records_update on public.employee_training_records;
create policy employee_training_records_update
  on public.employee_training_records
  for update
  to authenticated
  using (
    (org_id = current_org_id())
    and (
      has_permission((select auth.uid()), org_id, 'hr.manage_records'::text, '{}'::jsonb)
      or (
        (user_id = (select auth.uid()))
        and has_permission((select auth.uid()), org_id, 'hr.view_own'::text, '{}'::jsonb)
      )
    )
  )
  with check (
    (org_id = current_org_id())
    and (
      has_permission((select auth.uid()), org_id, 'hr.manage_records'::text, '{}'::jsonb)
      or (
        (user_id = (select auth.uid()))
        and has_permission((select auth.uid()), org_id, 'hr.view_own'::text, '{}'::jsonb)
      )
    )
  );

drop policy if exists employee_training_records_delete on public.employee_training_records;
create policy employee_training_records_delete
  on public.employee_training_records
  for delete
  to authenticated
  using (
    (org_id = current_org_id())
    and (
      has_permission((select auth.uid()), org_id, 'hr.manage_records'::text, '{}'::jsonb)
      or (
        (user_id = (select auth.uid()))
        and has_permission((select auth.uid()), org_id, 'hr.view_own'::text, '{}'::jsonb)
      )
    )
  );

drop policy if exists leave_request_documents_select on public.leave_request_documents;
create policy leave_request_documents_select
  on public.leave_request_documents
  for select
  to authenticated
  using (
    (org_id = current_org_id())
    and (
      (requester_id = (select auth.uid()))
      or has_permission((select auth.uid()), org_id, 'leave.manage_org'::text, '{}'::jsonb)
      or (
        has_permission((select auth.uid()), org_id, 'leave.approve_direct_reports'::text, '{}'::jsonb)
        and exists (
          select 1
          from public.profiles p
          where p.id = leave_request_documents.requester_id
            and p.reports_to_user_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists leave_request_documents_insert on public.leave_request_documents;
create policy leave_request_documents_insert
  on public.leave_request_documents
  for insert
  to authenticated
  with check (
    (org_id = current_org_id())
    and (requester_id = (select auth.uid()))
    and exists (
      select 1
      from public.leave_requests r
      where r.id = leave_request_documents.request_id
        and r.org_id = leave_request_documents.org_id
        and r.requester_id = (select auth.uid())
    )
  );

drop policy if exists leave_request_documents_delete on public.leave_request_documents;
create policy leave_request_documents_delete
  on public.leave_request_documents
  for delete
  to authenticated
  using (
    (org_id = current_org_id())
    and (
      (requester_id = (select auth.uid()))
      or has_permission((select auth.uid()), org_id, 'leave.manage_org'::text, '{}'::jsonb)
    )
  );
