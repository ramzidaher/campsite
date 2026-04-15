-- Security hardening for employee records master-data features.
-- - Tighten storage bucket RLS for employee photos, ID docs, and tax docs
-- - Add atomic approval RPCs for bank details and UK tax details
-- - Require approved-only status for GDPR erasure execution

drop policy if exists employee_photo_storage_select on storage.objects;
drop policy if exists employee_photo_storage_insert on storage.objects;
drop policy if exists employee_photo_storage_update on storage.objects;
drop policy if exists employee_photo_storage_delete on storage.objects;
drop policy if exists employee_id_storage_select on storage.objects;
drop policy if exists employee_id_storage_insert on storage.objects;
drop policy if exists employee_id_storage_update on storage.objects;
drop policy if exists employee_id_storage_delete on storage.objects;
drop policy if exists employee_tax_documents_storage_select on storage.objects;
drop policy if exists employee_tax_documents_storage_insert on storage.objects;
drop policy if exists employee_tax_documents_storage_update on storage.objects;
drop policy if exists employee_tax_documents_storage_delete on storage.objects;

create policy employee_photo_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-photos'
      and d.document_kind = 'employee_photo'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.view_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.view_own', '{}'::jsonb))
      )
  )
);

create policy employee_photo_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and (
    public.has_permission(auth.uid(), public.current_org_id(), 'hr.employee_photo.manage_all', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), public.current_org_id(), 'hr.employee_photo.upload_own', '{}'::jsonb)
      and (
        case
          when split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      ) = auth.uid()
    )
  )
);

create policy employee_photo_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-photos'
      and d.document_kind = 'employee_photo'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.upload_own', '{}'::jsonb))
      )
  )
)
with check (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
);

create policy employee_photo_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-photos'
      and d.document_kind = 'employee_photo'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.employee_photo.delete_own', '{}'::jsonb))
      )
  )
);

create policy employee_id_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-id-documents'
      and d.document_kind = 'id_document'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.id_document.view_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.id_document.view_own', '{}'::jsonb))
      )
  )
);

create policy employee_id_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and (
    public.has_permission(auth.uid(), public.current_org_id(), 'hr.id_document.manage_all', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), public.current_org_id(), 'hr.id_document.upload_own', '{}'::jsonb)
      and (
        case
          when split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      ) = auth.uid()
    )
  )
);

create policy employee_id_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-id-documents'
      and d.document_kind = 'id_document'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.id_document.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.id_document.upload_own', '{}'::jsonb))
      )
  )
)
with check (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
);

create policy employee_id_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.bucket_id = 'employee-id-documents'
      and d.document_kind = 'id_document'
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'hr.id_document.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'hr.id_document.delete_own', '{}'::jsonb))
      )
  )
);

create policy employee_tax_documents_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_tax_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.view_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.view_own', '{}'::jsonb))
      )
  )
);

create policy employee_tax_documents_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and coalesce(array_length(string_to_array(name, '/'), 1), 0) >= 3
  and (
    public.has_permission(auth.uid(), public.current_org_id(), 'payroll.tax_docs.manage_all', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), public.current_org_id(), 'payroll.tax_docs.upload_own', '{}'::jsonb)
      and (
        case
          when split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      ) = auth.uid()
    )
  )
);

create policy employee_tax_documents_storage_update on storage.objects for update to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_tax_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
      )
  )
)
with check (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
);

create policy employee_tax_documents_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_tax_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
      )
  )
);

create or replace function public.payroll_approve_bank_detail(
  p_bank_detail_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.employee_bank_details%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_row
  from public.employee_bank_details
  where id = p_bank_detail_id
  for update;

  if not found then
    raise exception 'Record not found';
  end if;

  if not public.has_permission(v_uid, v_row.org_id, 'payroll.bank_details.manage_all', '{}'::jsonb) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Only pending records can be approved';
  end if;

  update public.employee_bank_details
  set is_active = false
  where org_id = v_row.org_id
    and user_id = v_row.user_id
    and is_active = true
    and id <> v_row.id;

  update public.employee_bank_details
  set
    status = 'approved',
    is_active = true,
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_note = nullif(trim(p_review_note), '')
  where id = v_row.id;

  insert into public.employee_bank_detail_events (
    org_id, bank_detail_id, user_id, actor_user_id, event_type, reason
  )
  values (
    v_row.org_id, v_row.id, v_row.user_id, v_uid, 'approved', nullif(trim(p_review_note), '')
  );

  return jsonb_build_object(
    'bank_detail_id', v_row.id,
    'user_id', v_row.user_id,
    'status', 'approved'
  );
end;
$$;

create or replace function public.payroll_approve_uk_tax_detail(
  p_uk_tax_detail_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.employee_uk_tax_details%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_row
  from public.employee_uk_tax_details
  where id = p_uk_tax_detail_id
  for update;

  if not found then
    raise exception 'Record not found';
  end if;

  if not public.has_permission(v_uid, v_row.org_id, 'payroll.uk_tax.manage_all', '{}'::jsonb) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Only pending records can be approved';
  end if;

  update public.employee_uk_tax_details
  set is_active = false
  where org_id = v_row.org_id
    and user_id = v_row.user_id
    and is_active = true
    and id <> v_row.id;

  update public.employee_uk_tax_details
  set
    status = 'approved',
    is_active = true,
    reviewed_by = v_uid,
    reviewed_at = now(),
    review_note = nullif(trim(p_review_note), '')
  where id = v_row.id;

  insert into public.employee_uk_tax_detail_events (
    org_id, uk_tax_detail_id, user_id, actor_user_id, event_type, reason
  )
  values (
    v_row.org_id, v_row.id, v_row.user_id, v_uid, 'approved', nullif(trim(p_review_note), '')
  );

  return jsonb_build_object(
    'uk_tax_detail_id', v_row.id,
    'user_id', v_row.user_id,
    'status', 'approved'
  );
end;
$$;

revoke all on function public.payroll_approve_bank_detail(uuid, text) from public;
grant execute on function public.payroll_approve_bank_detail(uuid, text) to authenticated;
revoke all on function public.payroll_approve_uk_tax_detail(uuid, text) from public;
grant execute on function public.payroll_approve_uk_tax_detail(uuid, text) to authenticated;

create or replace function public.privacy_erasure_execute(
  p_erasure_request_id uuid,
  p_execution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req record;
  v_counts jsonb := '{}'::jsonb;
  v_hr_docs_deleted int := 0;
  v_dependants_deleted int := 0;
  v_cases_deleted int := 0;
  v_medical_deleted int := 0;
  v_custom_values_deleted int := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_req
  from public.privacy_erasure_requests r
  where r.id = p_erasure_request_id
  for update;

  if not found then
    raise exception 'Erasure request not found';
  end if;

  if not public.has_permission(v_uid, v_req.org_id, 'privacy.erasure_request.execute', '{}'::jsonb) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_req.status <> 'approved' then
    raise exception 'Erasure request must be approved before execution';
  end if;

  delete from public.employee_hr_documents
  where org_id = v_req.org_id and user_id = v_req.user_id;
  get diagnostics v_hr_docs_deleted = row_count;

  delete from public.employee_dependants
  where org_id = v_req.org_id and user_id = v_req.user_id;
  get diagnostics v_dependants_deleted = row_count;

  delete from public.employee_case_records
  where org_id = v_req.org_id and user_id = v_req.user_id;
  get diagnostics v_cases_deleted = row_count;

  delete from public.employee_medical_notes
  where org_id = v_req.org_id and user_id = v_req.user_id;
  get diagnostics v_medical_deleted = row_count;

  delete from public.hr_custom_field_values
  where org_id = v_req.org_id and user_id = v_req.user_id;
  get diagnostics v_custom_values_deleted = row_count;

  update public.profiles
  set
    full_name = 'Erased User',
    preferred_name = null,
    email = concat('erased+', id::text, '@example.invalid'),
    avatar_url = null,
    phone = null,
    updated_at = now()
  where id = v_req.user_id and org_id = v_req.org_id;

  update public.privacy_erasure_requests
  set
    status = 'executed',
    execution_note = coalesce(nullif(trim(p_execution_note), ''), execution_note),
    executed_by = v_uid,
    executed_at = now()
  where id = v_req.id;

  v_counts := jsonb_build_object(
    'employee_hr_documents_deleted', v_hr_docs_deleted,
    'employee_dependants_deleted', v_dependants_deleted,
    'employee_case_records_deleted', v_cases_deleted,
    'employee_medical_notes_deleted', v_medical_deleted,
    'hr_custom_field_values_deleted', v_custom_values_deleted,
    'payroll_retained', true
  );

  insert into public.privacy_erasure_audit_events (
    org_id, erasure_request_id, user_id, actor_user_id, event_type, payload, reason
  )
  values (
    v_req.org_id, v_req.id, v_req.user_id, v_uid, 'executed', v_counts, p_execution_note
  );

  return v_counts;
end;
$$;

