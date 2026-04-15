-- Medical / occupational health notes with strict access controls and encrypted sensitive payloads.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.medical_notes.view_all', 'View medical notes (all)', 'View medical and occupational health case summaries for all employees.', false),
  ('hr.medical_notes.manage_all', 'Manage medical notes (all)', 'Create, update, and archive medical and occupational health cases for all employees.', false),
  ('hr.medical_notes.view_own_summary', 'View own medical summary', 'View your own medical and occupational health outcomes and summary fields.', false),
  ('hr.medical_notes.reveal_sensitive', 'Reveal sensitive medical notes', 'Reveal encrypted sensitive medical notes with reason and audit trail.', false),
  ('hr.medical_notes.export', 'Export medical notes', 'Export medical/occupational health records with explicit audit logging.', false),
  ('hr.medical_notes.manage_own', 'Manage own medical submissions', 'Submit or update your own medical/occupational health referral records.', false)
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
    ('hr.view_records', 'hr.medical_notes.view_all'),
    ('hr.manage_records', 'hr.medical_notes.view_all'),
    ('hr.manage_records', 'hr.medical_notes.manage_all'),
    ('hr.manage_records', 'hr.medical_notes.reveal_sensitive'),
    ('hr.manage_records', 'hr.medical_notes.export'),
    ('hr.view_own', 'hr.medical_notes.view_own_summary'),
    ('hr.view_own', 'hr.medical_notes.manage_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_medical_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  case_ref text not null,
  referral_reason text null,
  status text not null default 'open' check (status in ('open', 'under_review', 'fit_note_received', 'closed')),
  fit_for_work_outcome text null,
  recommended_adjustments text null,
  review_date date null,
  next_review_date date null,
  summary_for_employee text null,
  encrypted_sensitive_payload text not null,
  archived_at timestamptz null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_medical_notes_case_ref_unique unique (org_id, case_ref)
);

create index if not exists employee_medical_notes_org_user_idx
  on public.employee_medical_notes(org_id, user_id, created_at desc);

create table if not exists public.employee_medical_note_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  medical_note_id uuid not null references public.employee_medical_notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'archived', 'revealed_sensitive', 'exported')),
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_medical_note_events_org_note_idx
  on public.employee_medical_note_events(org_id, medical_note_id, created_at desc);

create or replace function public.employee_medical_notes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_medical_notes_set_updated_at_trg on public.employee_medical_notes;
create trigger employee_medical_notes_set_updated_at_trg
before update on public.employee_medical_notes
for each row execute function public.employee_medical_notes_set_updated_at();

alter table public.employee_medical_notes enable row level security;
alter table public.employee_medical_note_events enable row level security;

revoke all on public.employee_medical_notes from public;
grant select, insert, update on public.employee_medical_notes to authenticated;

drop policy if exists employee_medical_notes_select on public.employee_medical_notes;
create policy employee_medical_notes_select
on public.employee_medical_notes for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.view_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.view_own_summary', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_medical_notes_insert on public.employee_medical_notes;
create policy employee_medical_notes_insert
on public.employee_medical_notes for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_medical_notes_update on public.employee_medical_notes;
create policy employee_medical_notes_update
on public.employee_medical_notes for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_own', '{}'::jsonb)
    )
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_own', '{}'::jsonb)
    )
  )
);

revoke all on public.employee_medical_note_events from public;
grant select, insert on public.employee_medical_note_events to authenticated;

drop policy if exists employee_medical_note_events_select on public.employee_medical_note_events;
create policy employee_medical_note_events_select
on public.employee_medical_note_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.view_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.view_own_summary', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_medical_note_events_insert on public.employee_medical_note_events;
create policy employee_medical_note_events_insert
on public.employee_medical_note_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_all', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'hr.medical_notes.reveal_sensitive', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.medical_notes.manage_own', '{}'::jsonb)
    )
  )
);
