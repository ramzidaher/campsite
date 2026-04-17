-- Dedicated employee training/certification records for self-service profile.

create table if not exists public.employee_training_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  provider text null check (provider is null or char_length(trim(provider)) <= 180),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'expired')),
  started_on date null,
  completed_on date null,
  expires_on date null,
  notes text null,
  certificate_document_url text null,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_on is null or started_on is null or completed_on >= started_on)
);

create index if not exists employee_training_records_org_user_created_idx
  on public.employee_training_records (org_id, user_id, created_at desc);

create index if not exists employee_training_records_org_user_expiry_idx
  on public.employee_training_records (org_id, user_id, expires_on);

create or replace function public.employee_training_records_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_training_records_set_updated_at_trg on public.employee_training_records;
create trigger employee_training_records_set_updated_at_trg
before update on public.employee_training_records
for each row execute function public.employee_training_records_set_updated_at();

alter table public.employee_training_records enable row level security;

revoke all on public.employee_training_records from public;
grant select, insert, update, delete on public.employee_training_records to authenticated;

drop policy if exists employee_training_records_select on public.employee_training_records;
create policy employee_training_records_select
on public.employee_training_records
for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1
        from public.profiles p
        where p.id = employee_training_records.user_id
          and p.org_id = org_id
          and p.reports_to_user_id is not distinct from auth.uid()
      )
    )
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_training_records_insert on public.employee_training_records;
create policy employee_training_records_insert
on public.employee_training_records
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_training_records_update on public.employee_training_records;
create policy employee_training_records_update
on public.employee_training_records
for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_training_records_delete on public.employee_training_records;
create policy employee_training_records_delete
on public.employee_training_records
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);
