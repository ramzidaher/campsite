-- Disciplinary and grievance case logging with audit trail and scoped access.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.disciplinary.view_all', 'View disciplinary records (all)', 'View disciplinary records across the organisation.', false),
  ('hr.disciplinary.manage_all', 'Manage disciplinary records (all)', 'Create, edit, and archive disciplinary records across the organisation.', false),
  ('hr.disciplinary.view_own', 'View own disciplinary records', 'View your own disciplinary records and outcomes.', false),
  ('hr.grievance.view_all', 'View grievance records (all)', 'View grievance records across the organisation.', false),
  ('hr.grievance.manage_all', 'Manage grievance records (all)', 'Create, edit, and archive grievance records across the organisation.', false),
  ('hr.grievance.view_own', 'View own grievance records', 'View your own grievance records and outcomes.', false)
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
    ('hr.view_records', 'hr.disciplinary.view_all'),
    ('hr.manage_records', 'hr.disciplinary.view_all'),
    ('hr.manage_records', 'hr.disciplinary.manage_all'),
    ('hr.view_own', 'hr.disciplinary.view_own'),
    ('hr.view_records', 'hr.grievance.view_all'),
    ('hr.manage_records', 'hr.grievance.view_all'),
    ('hr.manage_records', 'hr.grievance.manage_all'),
    ('hr.view_own', 'hr.grievance.view_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_case_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_type text not null check (case_type in ('disciplinary', 'grievance')),
  case_ref text not null,
  category text null,
  severity text null,
  status text not null default 'open' check (status in ('open', 'investigating', 'hearing', 'outcome_issued', 'appeal', 'closed')),
  incident_date date null,
  reported_date date null,
  hearing_date date null,
  outcome_effective_date date null,
  review_date date null,
  summary text null,
  allegations_details text null,
  outcome_action text null,
  appeal_submitted boolean not null default false,
  appeal_outcome text null,
  owner_user_id uuid null references public.profiles(id) on delete set null,
  investigator_user_id uuid null references public.profiles(id) on delete set null,
  witness_details text null,
  investigation_notes text null,
  internal_notes text null,
  linked_documents jsonb not null default '[]'::jsonb,
  archived_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_case_records_case_ref_unique unique (org_id, case_ref)
);

create index if not exists employee_case_records_org_user_idx
  on public.employee_case_records(org_id, user_id, created_at desc);

create index if not exists employee_case_records_org_type_status_idx
  on public.employee_case_records(org_id, case_type, status, created_at desc);

create table if not exists public.employee_case_record_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  case_id uuid not null references public.employee_case_records(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'status_changed', 'outcome_changed', 'archived', 'unarchived')),
  old_status text null,
  new_status text null,
  old_outcome_action text null,
  new_outcome_action text null,
  changed_fields jsonb not null default '[]'::jsonb,
  note text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists employee_case_record_events_org_case_idx
  on public.employee_case_record_events(org_id, case_id, created_at desc);

create or replace function public.employee_case_records_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_case_records_set_updated_at_trg on public.employee_case_records;
create trigger employee_case_records_set_updated_at_trg
before update on public.employee_case_records
for each row execute function public.employee_case_records_set_updated_at();

create or replace function public.log_employee_case_record_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed_fields jsonb := '[]'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.employee_case_record_events (
      org_id, case_id, event_type, new_status, new_outcome_action, created_by
    )
    values (
      new.org_id, new.id, 'created', new.status, new.outcome_action, auth.uid()
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_changed_fields := v_changed_fields || to_jsonb('status');
      insert into public.employee_case_record_events (
        org_id, case_id, event_type, old_status, new_status, created_by
      )
      values (
        new.org_id, new.id, 'status_changed', old.status, new.status, auth.uid()
      );
    end if;

    if old.outcome_action is distinct from new.outcome_action then
      v_changed_fields := v_changed_fields || to_jsonb('outcome_action');
      insert into public.employee_case_record_events (
        org_id, case_id, event_type, old_outcome_action, new_outcome_action, created_by
      )
      values (
        new.org_id, new.id, 'outcome_changed', old.outcome_action, new.outcome_action, auth.uid()
      );
    end if;

    if old.archived_at is null and new.archived_at is not null then
      v_changed_fields := v_changed_fields || to_jsonb('archived_at');
      insert into public.employee_case_record_events (
        org_id, case_id, event_type, created_by
      )
      values (
        new.org_id, new.id, 'archived', auth.uid()
      );
    elsif old.archived_at is not null and new.archived_at is null then
      v_changed_fields := v_changed_fields || to_jsonb('archived_at');
      insert into public.employee_case_record_events (
        org_id, case_id, event_type, created_by
      )
      values (
        new.org_id, new.id, 'unarchived', auth.uid()
      );
    end if;

    if old is distinct from new then
      insert into public.employee_case_record_events (
        org_id, case_id, event_type, changed_fields, created_by
      )
      values (
        new.org_id, new.id, 'updated', v_changed_fields, auth.uid()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employee_case_records_audit_trg on public.employee_case_records;
create trigger employee_case_records_audit_trg
after insert or update on public.employee_case_records
for each row execute function public.log_employee_case_record_event();

alter table public.employee_case_records enable row level security;
alter table public.employee_case_record_events enable row level security;

revoke all on public.employee_case_records from public;
grant select, insert, update on public.employee_case_records to authenticated;

drop policy if exists employee_case_records_select on public.employee_case_records;
create policy employee_case_records_select
on public.employee_case_records for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (
      case_type = 'disciplinary'
      and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.view_all', '{}'::jsonb)
    )
    or (
      case_type = 'grievance'
      and public.has_permission(auth.uid(), org_id, 'hr.grievance.view_all', '{}'::jsonb)
    )
    or (
      public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1
        from public.profiles p
        where p.id = employee_case_records.user_id
          and p.org_id = org_id
          and p.reports_to_user_id is not distinct from auth.uid()
      )
    )
    or (
      user_id = auth.uid()
      and (
        (case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.view_own', '{}'::jsonb))
        or (case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.view_own', '{}'::jsonb))
      )
    )
  )
);

drop policy if exists employee_case_records_insert on public.employee_case_records;
create policy employee_case_records_insert
on public.employee_case_records for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (
    (case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.manage_all', '{}'::jsonb))
    or (case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.manage_all', '{}'::jsonb))
  )
);

drop policy if exists employee_case_records_update on public.employee_case_records;
create policy employee_case_records_update
on public.employee_case_records for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.manage_all', '{}'::jsonb))
    or (case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.manage_all', '{}'::jsonb))
  )
)
with check (
  org_id = public.current_org_id()
  and (
    (case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.manage_all', '{}'::jsonb))
    or (case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.manage_all', '{}'::jsonb))
  )
);

revoke all on public.employee_case_record_events from public;
grant select on public.employee_case_record_events to authenticated;

drop policy if exists employee_case_record_events_select on public.employee_case_record_events;
create policy employee_case_record_events_select
on public.employee_case_record_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.employee_case_records c
    where c.id = employee_case_record_events.case_id
      and c.org_id = org_id
      and (
        (c.case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.view_all', '{}'::jsonb))
        or (c.case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.view_all', '{}'::jsonb))
        or (
          public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
          and exists (
            select 1
            from public.profiles p
            where p.id = c.user_id
              and p.org_id = org_id
              and p.reports_to_user_id is not distinct from auth.uid()
          )
        )
        or (
          c.user_id = auth.uid()
          and (
            (c.case_type = 'disciplinary' and public.has_permission(auth.uid(), org_id, 'hr.disciplinary.view_own', '{}'::jsonb))
            or (c.case_type = 'grievance' and public.has_permission(auth.uid(), org_id, 'hr.grievance.view_own', '{}'::jsonb))
          )
        )
      )
  )
);
