-- GDPR data retention and right-to-erasure workflow.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('privacy.retention_policy.view', 'View retention policies', 'View organisation data retention policies.', false),
  ('privacy.retention_policy.manage', 'Manage retention policies', 'Create and update organisation data retention policies.', false),
  ('privacy.erasure_request.create', 'Create erasure requests', 'Create GDPR right-to-erasure requests.', false),
  ('privacy.erasure_request.review', 'Review erasure requests', 'Review and approve/reject erasure requests.', false),
  ('privacy.erasure_request.execute', 'Execute erasure requests', 'Execute approved erasure workflows.', false),
  ('privacy.erasure_request.audit_view', 'View erasure audit log', 'View audit logs for erasure requests.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, m.new_permission
from public.org_role_permissions rp
join (
  values
    ('hr.view_records', 'privacy.retention_policy.view'),
    ('hr.manage_records', 'privacy.retention_policy.view'),
    ('hr.manage_records', 'privacy.retention_policy.manage'),
    ('hr.view_own', 'privacy.erasure_request.create'),
    ('hr.manage_records', 'privacy.erasure_request.review'),
    ('hr.manage_records', 'privacy.erasure_request.execute'),
    ('hr.manage_records', 'privacy.erasure_request.audit_view')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.privacy_retention_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  domain text not null,
  retention_days integer not null check (retention_days >= 0),
  legal_basis text not null,
  action text not null check (action in ('delete', 'anonymize')),
  exceptions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint privacy_retention_policies_org_domain_unique unique (org_id, domain)
);

create table if not exists public.privacy_erasure_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'legal_review', 'approved', 'rejected', 'executed')),
  request_reason text not null,
  review_note text null,
  execution_note text null,
  approved_by uuid null references public.profiles(id) on delete set null,
  executed_by uuid null references public.profiles(id) on delete set null,
  approved_at timestamptz null,
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_erasure_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  erasure_request_id uuid not null references public.privacy_erasure_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('requested', 'reviewed', 'approved', 'rejected', 'previewed', 'executed')),
  domain text null,
  affected_count integer null,
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists privacy_erasure_requests_org_status_idx
  on public.privacy_erasure_requests(org_id, status, created_at desc);

create index if not exists privacy_erasure_audit_events_org_request_idx
  on public.privacy_erasure_audit_events(org_id, erasure_request_id, created_at desc);

create or replace function public.privacy_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists privacy_retention_policies_set_updated_at_trg on public.privacy_retention_policies;
create trigger privacy_retention_policies_set_updated_at_trg
before update on public.privacy_retention_policies
for each row execute function public.privacy_set_updated_at();

drop trigger if exists privacy_erasure_requests_set_updated_at_trg on public.privacy_erasure_requests;
create trigger privacy_erasure_requests_set_updated_at_trg
before update on public.privacy_erasure_requests
for each row execute function public.privacy_set_updated_at();

alter table public.privacy_retention_policies enable row level security;
alter table public.privacy_erasure_requests enable row level security;
alter table public.privacy_erasure_audit_events enable row level security;

revoke all on public.privacy_retention_policies from public;
grant select, insert, update on public.privacy_retention_policies to authenticated;

drop policy if exists privacy_retention_policies_select on public.privacy_retention_policies;
create policy privacy_retention_policies_select
on public.privacy_retention_policies for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.retention_policy.view', '{}'::jsonb)
);

drop policy if exists privacy_retention_policies_insert on public.privacy_retention_policies;
create policy privacy_retention_policies_insert
on public.privacy_retention_policies for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.retention_policy.manage', '{}'::jsonb)
);

drop policy if exists privacy_retention_policies_update on public.privacy_retention_policies;
create policy privacy_retention_policies_update
on public.privacy_retention_policies for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.retention_policy.manage', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.retention_policy.manage', '{}'::jsonb)
);

revoke all on public.privacy_erasure_requests from public;
grant select, insert, update on public.privacy_erasure_requests to authenticated;

drop policy if exists privacy_erasure_requests_select on public.privacy_erasure_requests;
create policy privacy_erasure_requests_select
on public.privacy_erasure_requests for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.review', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.audit_view', '{}'::jsonb)
    or requester_user_id = auth.uid()
    or user_id = auth.uid()
  )
);

drop policy if exists privacy_erasure_requests_insert on public.privacy_erasure_requests;
create policy privacy_erasure_requests_insert
on public.privacy_erasure_requests for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.create', '{}'::jsonb)
  and requester_user_id = auth.uid()
);

drop policy if exists privacy_erasure_requests_update on public.privacy_erasure_requests;
create policy privacy_erasure_requests_update
on public.privacy_erasure_requests for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.review', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.execute', '{}'::jsonb)
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.review', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.execute', '{}'::jsonb)
  )
);

revoke all on public.privacy_erasure_audit_events from public;
grant select, insert on public.privacy_erasure_audit_events to authenticated;

drop policy if exists privacy_erasure_audit_events_select on public.privacy_erasure_audit_events;
create policy privacy_erasure_audit_events_select
on public.privacy_erasure_audit_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.audit_view', '{}'::jsonb)
);

drop policy if exists privacy_erasure_audit_events_insert on public.privacy_erasure_audit_events;
create policy privacy_erasure_audit_events_insert
on public.privacy_erasure_audit_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
);

create or replace function public.privacy_erasure_preview(
  p_erasure_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req record;
  v_result jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_req
  from public.privacy_erasure_requests r
  where r.id = p_erasure_request_id;

  if not found then
    raise exception 'Erasure request not found';
  end if;

  if not public.has_permission(v_uid, v_req.org_id, 'privacy.erasure_request.review', '{}'::jsonb)
     and not public.has_permission(v_uid, v_req.org_id, 'privacy.erasure_request.execute', '{}'::jsonb) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  v_result := jsonb_build_object(
    'profile', (select count(*) from public.profiles p where p.id = v_req.user_id and p.org_id = v_req.org_id),
    'employee_hr_documents', (select count(*) from public.employee_hr_documents d where d.org_id = v_req.org_id and d.user_id = v_req.user_id),
    'employee_dependants', (select count(*) from public.employee_dependants d where d.org_id = v_req.org_id and d.user_id = v_req.user_id),
    'employee_medical_notes', (select count(*) from public.employee_medical_notes m where m.org_id = v_req.org_id and m.user_id = v_req.user_id),
    'employee_case_records', (select count(*) from public.employee_case_records c where c.org_id = v_req.org_id and c.user_id = v_req.user_id),
    'hr_custom_field_values', (select count(*) from public.hr_custom_field_values v where v.org_id = v_req.org_id and v.user_id = v_req.user_id),
    'payroll_retained', (select count(*) from public.employee_bank_details b where b.org_id = v_req.org_id and b.user_id = v_req.user_id)
      + (select count(*) from public.employee_uk_tax_details t where t.org_id = v_req.org_id and t.user_id = v_req.user_id)
  );

  insert into public.privacy_erasure_audit_events (
    org_id, erasure_request_id, user_id, actor_user_id, event_type, payload
  )
  values (
    v_req.org_id, v_req.id, v_req.user_id, v_uid, 'previewed', v_result
  );

  return v_result;
end;
$$;

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

  if v_req.status not in ('approved', 'legal_review') then
    raise exception 'Erasure request must be approved/legal_review before execution';
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

revoke all on function public.privacy_erasure_preview(uuid) from public;
grant execute on function public.privacy_erasure_preview(uuid) to authenticated;
revoke all on function public.privacy_erasure_execute(uuid, text) from public;
grant execute on function public.privacy_erasure_execute(uuid, text) to authenticated;
