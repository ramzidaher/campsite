-- Policies on profiles / employee_hr_documents were recreated after 20260629140000_rls_auth_initplan_wrap.sql
-- without wrapping auth.uid() in scalar subqueries. Restore initplan form (linter 0003).
-- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

drop policy if exists profiles_select_department_isolation on public.profiles;

create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (
    public.can_view_profile_sensitive((select auth.uid()), profiles.id, profiles.org_id)
  );

-- ---------------------------------------------------------------------------
-- employee_hr_documents (table + storage): wrap auth.uid() for initplan
-- ---------------------------------------------------------------------------

drop policy if exists employee_hr_documents_select on public.employee_hr_documents;

create policy employee_hr_documents_select
on public.employee_hr_documents for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission((select auth.uid()), org_id, 'hr.view_records', '{}'::jsonb)
    or (
      public.has_permission((select auth.uid()), org_id, 'hr.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1
        from public.profiles p
        where p.id = employee_hr_documents.user_id
          and p.org_id = org_id
          and p.reports_to_user_id is not distinct from (select auth.uid())
      )
    )
    or (
      employee_hr_documents.user_id = (select auth.uid())
      and public.has_permission((select auth.uid()), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_hr_documents_insert_manage on public.employee_hr_documents;

create policy employee_hr_documents_insert_manage
on public.employee_hr_documents for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and uploaded_by = (select auth.uid())
  and public.has_permission((select auth.uid()), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

drop policy if exists employee_hr_documents_update_manage on public.employee_hr_documents;

create policy employee_hr_documents_update_manage
on public.employee_hr_documents for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission((select auth.uid()), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
)
with check (
  org_id = public.current_org_id()
  and public.has_permission((select auth.uid()), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

drop policy if exists employee_hr_documents_delete_manage on public.employee_hr_documents;

create policy employee_hr_documents_delete_manage
on public.employee_hr_documents for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission((select auth.uid()), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

drop policy if exists employee_hr_documents_storage_insert on storage.objects;
create policy employee_hr_documents_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and coalesce(array_length(string_to_array(name, '/'), 1), 0) >= 3
  and public.has_permission(
    (select auth.uid()),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);

drop policy if exists employee_hr_documents_storage_update on storage.objects;
create policy employee_hr_documents_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    (select auth.uid()),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
)
with check (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    (select auth.uid()),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);

drop policy if exists employee_hr_documents_storage_delete on storage.objects;
create policy employee_hr_documents_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    (select auth.uid()),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);
