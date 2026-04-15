-- Custom HR fields: org-level definitions + per-employee values + audit events.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.custom_fields.view', 'View custom HR fields', 'View custom HR field definitions and values.', false),
  ('hr.custom_fields.manage_definitions', 'Manage custom HR field definitions', 'Create/update/archive custom HR field definitions for the organisation.', false),
  ('hr.custom_fields.manage_values_all', 'Manage custom HR field values (all)', 'Manage custom HR field values for all employees.', false),
  ('hr.custom_fields.manage_values_own', 'Manage own custom HR field values', 'Manage your own custom HR field values.', false)
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
    ('hr.view_records', 'hr.custom_fields.view'),
    ('hr.manage_records', 'hr.custom_fields.view'),
    ('hr.manage_records', 'hr.custom_fields.manage_definitions'),
    ('hr.manage_records', 'hr.custom_fields.manage_values_all'),
    ('hr.view_own', 'hr.custom_fields.manage_values_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.hr_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  key text not null,
  label text not null,
  description text null,
  section text not null default 'personal',
  field_type text not null check (field_type in ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email', 'phone', 'currency')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  is_hr_only boolean not null default false,
  visible_to_manager boolean not null default false,
  visible_to_self boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_custom_field_definitions_org_key_unique unique (org_id, key)
);

create table if not exists public.hr_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  definition_id uuid not null references public.hr_custom_field_definitions(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_custom_field_values_org_user_def_unique unique (org_id, user_id, definition_id)
);

create table if not exists public.hr_custom_field_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  event_scope text not null check (event_scope in ('definition', 'value')),
  definition_id uuid null references public.hr_custom_field_definitions(id) on delete cascade,
  user_id uuid null references public.profiles(id) on delete cascade,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created', 'updated', 'archived', 'value_set', 'value_cleared')),
  old_value jsonb null,
  new_value jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists hr_custom_field_definitions_org_idx
  on public.hr_custom_field_definitions(org_id, section, sort_order, created_at);

create index if not exists hr_custom_field_values_org_user_idx
  on public.hr_custom_field_values(org_id, user_id, created_at desc);

create index if not exists hr_custom_field_events_org_idx
  on public.hr_custom_field_events(org_id, created_at desc);

create or replace function public.hr_custom_fields_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists hr_custom_field_definitions_set_updated_at_trg on public.hr_custom_field_definitions;
create trigger hr_custom_field_definitions_set_updated_at_trg
before update on public.hr_custom_field_definitions
for each row execute function public.hr_custom_fields_set_updated_at();

drop trigger if exists hr_custom_field_values_set_updated_at_trg on public.hr_custom_field_values;
create trigger hr_custom_field_values_set_updated_at_trg
before update on public.hr_custom_field_values
for each row execute function public.hr_custom_fields_set_updated_at();

create or replace function public.hr_custom_field_definitions_audit_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.hr_custom_field_events (org_id, event_scope, definition_id, actor_user_id, event_type, new_value)
    values (new.org_id, 'definition', new.id, auth.uid(), 'created', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.hr_custom_field_events (org_id, event_scope, definition_id, actor_user_id, event_type, old_value, new_value)
    values (
      new.org_id,
      'definition',
      new.id,
      auth.uid(),
      case when old.is_active = true and new.is_active = false then 'archived' else 'updated' end,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists hr_custom_field_definitions_audit_trg on public.hr_custom_field_definitions;
create trigger hr_custom_field_definitions_audit_trg
after insert or update on public.hr_custom_field_definitions
for each row execute function public.hr_custom_field_definitions_audit_trg_fn();

create or replace function public.hr_custom_field_values_audit_trg_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.hr_custom_field_events (org_id, event_scope, definition_id, user_id, actor_user_id, event_type, new_value)
    values (new.org_id, 'value', new.definition_id, new.user_id, auth.uid(), 'value_set', new.value);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.hr_custom_field_events (org_id, event_scope, definition_id, user_id, actor_user_id, event_type, old_value, new_value)
    values (new.org_id, 'value', new.definition_id, new.user_id, auth.uid(), 'value_set', old.value, new.value);
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.hr_custom_field_events (org_id, event_scope, definition_id, user_id, actor_user_id, event_type, old_value)
    values (old.org_id, 'value', old.definition_id, old.user_id, auth.uid(), 'value_cleared', old.value);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists hr_custom_field_values_audit_trg on public.hr_custom_field_values;
create trigger hr_custom_field_values_audit_trg
after insert or update or delete on public.hr_custom_field_values
for each row execute function public.hr_custom_field_values_audit_trg_fn();

alter table public.hr_custom_field_definitions enable row level security;
alter table public.hr_custom_field_values enable row level security;
alter table public.hr_custom_field_events enable row level security;

revoke all on public.hr_custom_field_definitions from public;
grant select, insert, update on public.hr_custom_field_definitions to authenticated;

drop policy if exists hr_custom_field_definitions_select on public.hr_custom_field_definitions;
create policy hr_custom_field_definitions_select
on public.hr_custom_field_definitions for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.custom_fields.view', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
  )
);

drop policy if exists hr_custom_field_definitions_insert on public.hr_custom_field_definitions;
create policy hr_custom_field_definitions_insert
on public.hr_custom_field_definitions for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_definitions', '{}'::jsonb)
);

drop policy if exists hr_custom_field_definitions_update on public.hr_custom_field_definitions;
create policy hr_custom_field_definitions_update
on public.hr_custom_field_definitions for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_definitions', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_definitions', '{}'::jsonb)
);

revoke all on public.hr_custom_field_values from public;
grant select, insert, update, delete on public.hr_custom_field_values to authenticated;

drop policy if exists hr_custom_field_values_select on public.hr_custom_field_values;
create policy hr_custom_field_values_select
on public.hr_custom_field_values for select
to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.hr_custom_field_definitions d
    where d.id = hr_custom_field_values.definition_id
      and d.org_id = org_id
      and (
        public.has_permission(auth.uid(), org_id, 'hr.custom_fields.view', '{}'::jsonb)
        or (
          public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
          and d.visible_to_manager = true
          and exists (
            select 1
            from public.profiles p
            where p.id = hr_custom_field_values.user_id
              and p.org_id = org_id
              and p.reports_to_user_id is not distinct from auth.uid()
          )
        )
        or (
          hr_custom_field_values.user_id = auth.uid()
          and d.visible_to_self = true
          and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
        )
      )
  )
);

drop policy if exists hr_custom_field_values_insert on public.hr_custom_field_values;
create policy hr_custom_field_values_insert
on public.hr_custom_field_values for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.hr_custom_field_definitions d
    where d.id = hr_custom_field_values.definition_id
      and d.org_id = org_id
      and (
        public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_all', '{}'::jsonb)
        or (
          hr_custom_field_values.user_id = auth.uid()
          and d.visible_to_self = true
          and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_own', '{}'::jsonb)
        )
      )
  )
);

drop policy if exists hr_custom_field_values_update on public.hr_custom_field_values;
create policy hr_custom_field_values_update
on public.hr_custom_field_values for update
to authenticated
using (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.hr_custom_field_definitions d
    where d.id = hr_custom_field_values.definition_id
      and d.org_id = org_id
      and (
        public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_all', '{}'::jsonb)
        or (
          hr_custom_field_values.user_id = auth.uid()
          and d.visible_to_self = true
          and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_own', '{}'::jsonb)
        )
      )
  )
)
with check (
  org_id = public.current_org_id()
  and exists (
    select 1
    from public.hr_custom_field_definitions d
    where d.id = hr_custom_field_values.definition_id
      and d.org_id = org_id
      and (
        public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_all', '{}'::jsonb)
        or (
          hr_custom_field_values.user_id = auth.uid()
          and d.visible_to_self = true
          and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_own', '{}'::jsonb)
        )
      )
  )
);

drop policy if exists hr_custom_field_values_delete on public.hr_custom_field_values;
create policy hr_custom_field_values_delete
on public.hr_custom_field_values for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.manage_values_own', '{}'::jsonb)
    )
  )
);

revoke all on public.hr_custom_field_events from public;
grant select on public.hr_custom_field_events to authenticated;

drop policy if exists hr_custom_field_events_select on public.hr_custom_field_events;
create policy hr_custom_field_events_select
on public.hr_custom_field_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.custom_fields.view', '{}'::jsonb)
);
