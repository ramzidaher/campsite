-- 1:1 check-ins: org/pair settings, templates, meetings, note edit requests, notification jobs, RPCs.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.org_one_on_one_settings (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  default_cadence_days integer not null default 14
    check (default_cadence_days >= 1 and default_cadence_days <= 365),
  due_soon_days integer not null default 3
    check (due_soon_days >= 0 and due_soon_days <= 90),
  reminder_offsets_minutes integer[] not null default array[1440, 120]::integer[]
    check (cardinality(reminder_offsets_minutes) <= 8),
  updated_at timestamptz not null default now()
);

comment on table public.org_one_on_one_settings is
  'Org-wide 1:1 cadence, compliance windows, and reminder offsets (minutes before starts_at).';

create table if not exists public.one_on_one_pair_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  manager_user_id uuid not null references public.profiles (id) on delete cascade,
  report_user_id uuid not null references public.profiles (id) on delete cascade,
  cadence_days integer
    check (cadence_days is null or (cadence_days >= 1 and cadence_days <= 365)),
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, manager_user_id, report_user_id)
);

create index if not exists one_on_one_pair_settings_org_report_idx
  on public.one_on_one_pair_settings (org_id, report_user_id);

comment on table public.one_on_one_pair_settings is
  'Optional per manager–report overrides for cadence and reminders.';

create table if not exists public.one_on_one_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  agenda_items jsonb not null default '[]'::jsonb,
  default_duration_minutes integer
    check (default_duration_minutes is null or (default_duration_minutes >= 5 and default_duration_minutes <= 480)),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists one_on_one_templates_org_idx
  on public.one_on_one_templates (org_id)
  where archived_at is null;

create table if not exists public.one_on_one_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  manager_user_id uuid not null references public.profiles (id) on delete cascade,
  report_user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.one_on_one_templates (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  shared_notes text not null default '',
  notes_locked_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (manager_user_id <> report_user_id),
  check (ends_at is null or ends_at > starts_at),
  check (
    (status = 'completed' and completed_at is not null and notes_locked_at is not null)
    or (status <> 'completed')
  )
);

create index if not exists one_on_one_meetings_org_report_starts_idx
  on public.one_on_one_meetings (org_id, report_user_id, starts_at desc);

create index if not exists one_on_one_meetings_org_manager_starts_idx
  on public.one_on_one_meetings (org_id, manager_user_id, starts_at desc);

create index if not exists one_on_one_meetings_reminder_idx
  on public.one_on_one_meetings (org_id, starts_at)
  where status in ('scheduled', 'in_progress');

comment on table public.one_on_one_meetings is
  'Scheduled or logged 1:1s; shared_notes editable until completed (notes_locked_at).';

create table if not exists public.one_on_one_note_edit_requests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.one_on_one_meetings (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  proposed_notes text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists one_on_one_note_edit_requests_meeting_idx
  on public.one_on_one_note_edit_requests (meeting_id, status);

-- ---------------------------------------------------------------------------
-- Notification jobs (push pipeline; processed by Edge function)
-- ---------------------------------------------------------------------------

create table if not exists public.one_on_one_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  event_type text not null
    check (event_type in ('meeting_reminder', 'pair_overdue_nudge')),
  meeting_id uuid references public.one_on_one_meetings (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);

create index if not exists one_on_one_notification_jobs_pending_idx
  on public.one_on_one_notification_jobs (created_at)
  where processed_at is null;

create table if not exists public.one_on_one_reminder_sent (
  meeting_id uuid not null references public.one_on_one_meetings (id) on delete cascade,
  offset_minutes integer not null,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, offset_minutes, starts_at)
);

create table if not exists public.one_on_one_overdue_nudge_sent (
  org_id uuid not null references public.organisations (id) on delete cascade,
  manager_user_id uuid not null references public.profiles (id) on delete cascade,
  report_user_id uuid not null references public.profiles (id) on delete cascade,
  nudge_date date not null,
  created_at timestamptz not null default now(),
  primary key (org_id, manager_user_id, report_user_id, nudge_date)
);

-- ---------------------------------------------------------------------------
-- RLS: deny direct access; use RPCs
-- ---------------------------------------------------------------------------

alter table public.org_one_on_one_settings enable row level security;
alter table public.one_on_one_pair_settings enable row level security;
alter table public.one_on_one_templates enable row level security;
alter table public.one_on_one_meetings enable row level security;
alter table public.one_on_one_note_edit_requests enable row level security;
alter table public.one_on_one_notification_jobs enable row level security;
alter table public.one_on_one_reminder_sent enable row level security;
alter table public.one_on_one_overdue_nudge_sent enable row level security;

drop policy if exists org_one_on_one_settings_deny on public.org_one_on_one_settings;
create policy org_one_on_one_settings_deny
  on public.org_one_on_one_settings for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_pair_settings_deny on public.one_on_one_pair_settings;
create policy one_on_one_pair_settings_deny
  on public.one_on_one_pair_settings for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_templates_deny on public.one_on_one_templates;
create policy one_on_one_templates_deny
  on public.one_on_one_templates for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_meetings_deny on public.one_on_one_meetings;
create policy one_on_one_meetings_deny
  on public.one_on_one_meetings for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_note_edit_requests_deny on public.one_on_one_note_edit_requests;
create policy one_on_one_note_edit_requests_deny
  on public.one_on_one_note_edit_requests for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_notification_jobs_deny on public.one_on_one_notification_jobs;
create policy one_on_one_notification_jobs_deny
  on public.one_on_one_notification_jobs for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_reminder_sent_deny on public.one_on_one_reminder_sent;
create policy one_on_one_reminder_sent_deny
  on public.one_on_one_reminder_sent for all to authenticated using (false) with check (false);

drop policy if exists one_on_one_overdue_nudge_sent_deny on public.one_on_one_overdue_nudge_sent;
create policy one_on_one_overdue_nudge_sent_deny
  on public.one_on_one_overdue_nudge_sent for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Permission catalog + role grants (org_admin full; manager pair management)
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('one_on_one.view_own',
   'View own 1:1 meetings',
   'View 1:1 check-ins you participate in as manager or direct report.',
   false),
  ('one_on_one.manage_direct_reports',
   'Manage 1:1s with direct reports',
   'Schedule and complete 1:1 meetings with people who report to you.',
   false),
  ('one_on_one.manage_templates',
   'Manage 1:1 templates and org settings',
   'Edit org 1:1 cadence defaults and meeting templates.',
   false)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'one_on_one.view_own'),
    ('org_admin', 'one_on_one.manage_direct_reports'),
    ('org_admin', 'one_on_one.manage_templates'),
    ('manager', 'one_on_one.view_own'),
    ('manager', 'one_on_one.manage_direct_reports'),
    ('coordinator', 'one_on_one.view_own'),
    ('coordinator', 'one_on_one.manage_direct_reports'),
    ('administrator', 'one_on_one.view_own'),
    ('duty_manager', 'one_on_one.view_own'),
    ('duty_manager', 'one_on_one.manage_direct_reports'),
    ('csa', 'one_on_one.view_own'),
    ('society_leader', 'one_on_one.view_own')
) as p(role_key, permission_key) on p.role_key = r.key
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public._one_on_one_effective_cadence_days(
  p_org_id uuid,
  p_manager_id uuid,
  p_report_id uuid
)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select ps.cadence_days
     from public.one_on_one_pair_settings ps
     where ps.org_id = p_org_id
       and ps.manager_user_id = p_manager_id
       and ps.report_user_id = p_report_id),
    (select s.default_cadence_days
     from public.org_one_on_one_settings s
     where s.org_id = p_org_id),
    14
  );
$$;

create or replace function public._one_on_one_validate_manager_report(
  p_org_id uuid,
  p_manager_id uuid,
  p_report_id uuid
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_reports_to uuid;
begin
  select p.reports_to_user_id into v_reports_to
  from public.profiles p
  where p.id = p_report_id and p.org_id = p_org_id and p.status = 'active';

  return v_reports_to is not null and v_reports_to = p_manager_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- org / pair settings RPCs
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_org_settings_get()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  r record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  if not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into r from public.org_one_on_one_settings where org_id = v_org;
  if r is null then
    insert into public.org_one_on_one_settings (org_id) values (v_org)
    on conflict (org_id) do nothing;
    select * into r from public.org_one_on_one_settings where org_id = v_org;
  end if;

  return jsonb_build_object(
    'org_id', r.org_id,
    'default_cadence_days', r.default_cadence_days,
    'due_soon_days', r.due_soon_days,
    'reminder_offsets_minutes', to_jsonb(r.reminder_offsets_minutes)
  );
end;
$$;

revoke all on function public.one_on_one_org_settings_get() from public;
grant execute on function public.one_on_one_org_settings_get() to authenticated;

create or replace function public.one_on_one_org_settings_upsert(
  p_default_cadence_days integer,
  p_due_soon_days integer,
  p_reminder_offsets_minutes integer[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_templates', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_default_cadence_days is null or p_default_cadence_days < 1 or p_default_cadence_days > 365 then
    raise exception 'invalid default_cadence_days';
  end if;
  if p_due_soon_days is null or p_due_soon_days < 0 or p_due_soon_days > 90 then
    raise exception 'invalid due_soon_days';
  end if;

  insert into public.org_one_on_one_settings (org_id, default_cadence_days, due_soon_days, reminder_offsets_minutes)
  values (
    v_org,
    p_default_cadence_days,
    p_due_soon_days,
    coalesce(p_reminder_offsets_minutes, array[1440, 120]::integer[])
  )
  on conflict (org_id) do update set
    default_cadence_days = excluded.default_cadence_days,
    due_soon_days = excluded.due_soon_days,
    reminder_offsets_minutes = excluded.reminder_offsets_minutes,
    updated_at = now();

  return public.one_on_one_org_settings_get();
end;
$$;

revoke all on function public.one_on_one_org_settings_upsert(integer, integer, integer[]) from public;
grant execute on function public.one_on_one_org_settings_upsert(integer, integer, integer[]) to authenticated;

create or replace function public.one_on_one_pair_settings_upsert(
  p_report_user_id uuid,
  p_cadence_days integer default null,
  p_reminders_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not public._one_on_one_validate_manager_report(v_org, v_uid, p_report_user_id) then
    raise exception 'not a direct report';
  end if;

  if p_cadence_days is not null and (p_cadence_days < 1 or p_cadence_days > 365) then
    raise exception 'invalid cadence_days';
  end if;

  insert into public.one_on_one_pair_settings (
    org_id, manager_user_id, report_user_id, cadence_days, reminders_enabled
  ) values (
    v_org, v_uid, p_report_user_id, p_cadence_days, coalesce(p_reminders_enabled, true)
  )
  on conflict (org_id, manager_user_id, report_user_id) do update set
    cadence_days = excluded.cadence_days,
    reminders_enabled = excluded.reminders_enabled,
    updated_at = now();
end;
$$;

revoke all on function public.one_on_one_pair_settings_upsert(uuid, integer, boolean) from public;
grant execute on function public.one_on_one_pair_settings_upsert(uuid, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_templates_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id', t.id,
         'name', t.name,
         'description', t.description,
         'agenda_items', t.agenda_items,
         'default_duration_minutes', t.default_duration_minutes,
         'archived_at', t.archived_at
       ) order by t.name
     )
     from public.one_on_one_templates t
     where t.org_id = v_org
       and t.archived_at is null),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_templates_list() from public;
grant execute on function public.one_on_one_templates_list() to authenticated;

create or replace function public.one_on_one_template_upsert(
  p_name text,
  p_agenda_items jsonb default '[]'::jsonb,
  p_description text default null,
  p_default_duration_minutes integer default null,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_tid uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_templates', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  if p_default_duration_minutes is not null
     and (p_default_duration_minutes < 5 or p_default_duration_minutes > 480) then
    raise exception 'invalid default_duration_minutes';
  end if;

  if p_template_id is null then
    insert into public.one_on_one_templates (
      org_id, name, description, agenda_items, default_duration_minutes, created_by
    ) values (
      v_org,
      trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      coalesce(p_agenda_items, '[]'::jsonb),
      p_default_duration_minutes,
      v_uid
    )
    returning id into v_tid;
  else
    update public.one_on_one_templates t set
      name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      agenda_items = coalesce(p_agenda_items, '[]'::jsonb),
      default_duration_minutes = p_default_duration_minutes,
      updated_at = now()
    where t.id = p_template_id and t.org_id = v_org
    returning t.id into v_tid;

    if v_tid is null then
      raise exception 'template not found';
    end if;
  end if;

  return v_tid;
end;
$$;

revoke all on function public.one_on_one_template_upsert(text, jsonb, text, integer, uuid) from public;
grant execute on function public.one_on_one_template_upsert(text, jsonb, text, integer, uuid) to authenticated;

create or replace function public.one_on_one_template_archive(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_templates', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  update public.one_on_one_templates t
  set archived_at = now(), updated_at = now()
  where t.id = p_template_id and t.org_id = v_org;
end;
$$;

revoke all on function public.one_on_one_template_archive(uuid) from public;
grant execute on function public.one_on_one_template_archive(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_list(
  p_limit integer default 50,
  p_include_cancelled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  if not v_hr and not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return coalesce(
    (select jsonb_agg(x.obj order by x.sort_key desc)
     from (
       select
         jsonb_build_object(
           'id', m.id,
           'manager_user_id', m.manager_user_id,
           'report_user_id', m.report_user_id,
           'manager_name', pm.full_name,
           'report_name', pr.full_name,
           'template_id', m.template_id,
           'starts_at', m.starts_at,
           'ends_at', m.ends_at,
           'status', m.status,
           'completed_at', m.completed_at,
           'notes_preview', left(m.shared_notes, 200)
         ) as obj,
         m.starts_at as sort_key
       from public.one_on_one_meetings m
       join public.profiles pm on pm.id = m.manager_user_id
       join public.profiles pr on pr.id = m.report_user_id
       where m.org_id = v_org
         and (
           v_hr
           or m.manager_user_id = v_uid
           or m.report_user_id = v_uid
         )
         and (p_include_cancelled or m.status <> 'cancelled')
       order by m.starts_at desc
       limit greatest(1, least(p_limit, 200))
     ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_meeting_list(integer, boolean) from public;
grant execute on function public.one_on_one_meeting_list(integer, boolean) to authenticated;

create or replace function public.one_on_one_meeting_get(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  select * into m
  from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then
    raise exception 'not found';
  end if;

  if not v_hr and m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if not v_hr and not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return jsonb_build_object(
    'id', m.id,
    'org_id', m.org_id,
    'manager_user_id', m.manager_user_id,
    'report_user_id', m.report_user_id,
    'manager_name', (select full_name from public.profiles where id = m.manager_user_id),
    'report_name', (select full_name from public.profiles where id = m.report_user_id),
    'template_id', m.template_id,
    'starts_at', m.starts_at,
    'ends_at', m.ends_at,
    'status', m.status,
    'shared_notes', m.shared_notes,
    'notes_locked_at', m.notes_locked_at,
    'completed_at', m.completed_at,
    'created_at', m.created_at,
    'updated_at', m.updated_at
  );
end;
$$;

revoke all on function public.one_on_one_meeting_get(uuid) from public;
grant execute on function public.one_on_one_meeting_get(uuid) to authenticated;

create or replace function public.one_on_one_meeting_upsert(
  p_report_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_template_id uuid default null,
  p_meeting_id uuid default null,
  p_status text default 'scheduled'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_mid uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not public._one_on_one_validate_manager_report(v_org, v_uid, p_report_user_id) then
    raise exception 'not a direct report';
  end if;

  if p_status not in ('scheduled', 'in_progress', 'cancelled') then
    raise exception 'invalid status for upsert';
  end if;

  if p_meeting_id is null then
    if p_template_id is not null and not exists (
      select 1 from public.one_on_one_templates t
      where t.id = p_template_id and t.org_id = v_org and t.archived_at is null
    ) then
      raise exception 'template not found';
    end if;

    insert into public.one_on_one_meetings (
      org_id, manager_user_id, report_user_id, template_id,
      starts_at, ends_at, status, created_by
    ) values (
      v_org, v_uid, p_report_user_id, p_template_id,
      p_starts_at, p_ends_at, p_status, v_uid
    )
    returning id into v_mid;
  else
    update public.one_on_one_meetings m set
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      template_id = coalesce(p_template_id, m.template_id),
      status = p_status,
      updated_at = now()
    where m.id = p_meeting_id
      and m.org_id = v_org
      and m.manager_user_id = v_uid
      and m.status <> 'completed'
    returning m.id into v_mid;

    if v_mid is null then
      raise exception 'meeting not found or not editable';
    end if;
  end if;

  return v_mid;
end;
$$;

revoke all on function public.one_on_one_meeting_upsert(uuid, timestamptz, timestamptz, uuid, uuid, text) from public;
grant execute on function public.one_on_one_meeting_upsert(uuid, timestamptz, timestamptz, uuid, uuid, text) to authenticated;

create or replace function public.one_on_one_meeting_set_status(
  p_meeting_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_status not in ('scheduled', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid status';
  end if;

  update public.one_on_one_meetings m set
    status = p_status,
    updated_at = now(),
    completed_at = case
      when p_status = 'completed' then now()
      when p_status = 'cancelled' then null
      else m.completed_at
    end,
    notes_locked_at = case
      when p_status = 'completed' then now()
      when p_status = 'cancelled' then null
      else m.notes_locked_at
    end
  where m.id = p_meeting_id
    and m.org_id = v_org
    and m.manager_user_id = v_uid
    and m.status <> 'completed';

  if not found then
    raise exception 'not found';
  end if;
end;
$$;

revoke all on function public.one_on_one_meeting_set_status(uuid, text) from public;
grant execute on function public.one_on_one_meeting_set_status(uuid, text) to authenticated;

create or replace function public.one_on_one_meeting_update_notes(
  p_meeting_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.status = 'cancelled' then
    raise exception 'cancelled';
  end if;

  if m.notes_locked_at is not null then
    raise exception 'notes locked';
  end if;

  if m.status = 'completed' then
    raise exception 'completed';
  end if;

  update public.one_on_one_meetings om
  set shared_notes = coalesce(p_notes, ''),
      updated_at = now()
  where om.id = p_meeting_id;
end;
$$;

revoke all on function public.one_on_one_meeting_update_notes(uuid, text) from public;
grant execute on function public.one_on_one_meeting_update_notes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Note edit requests
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_note_edit_request_create(
  p_meeting_id uuid,
  p_proposed_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
  v_rid uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.notes_locked_at is null then
    raise exception 'notes not locked';
  end if;

  if exists (
    select 1 from public.one_on_one_note_edit_requests r
    where r.meeting_id = p_meeting_id and r.status = 'pending'
  ) then
    raise exception 'pending request exists';
  end if;

  insert into public.one_on_one_note_edit_requests (
    meeting_id, org_id, requester_id, proposed_notes
  ) values (
    p_meeting_id, v_org, v_uid, coalesce(p_proposed_notes, '')
  )
  returning id into v_rid;

  return v_rid;
end;
$$;

revoke all on function public.one_on_one_note_edit_request_create(uuid, text) from public;
grant execute on function public.one_on_one_note_edit_request_create(uuid, text) to authenticated;

create or replace function public.one_on_one_note_edit_request_resolve(
  p_request_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  r record;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  select * into r from public.one_on_one_note_edit_requests req
  where req.id = p_request_id and req.org_id = v_org;

  if r is null then raise exception 'not found'; end if;
  if r.status <> 'pending' then raise exception 'already resolved'; end if;

  select * into m from public.one_on_one_meetings om where om.id = r.meeting_id;

  if m.org_id <> v_org then raise exception 'not allowed'; end if;

  if not (
    m.manager_user_id = v_uid
    or public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  update public.one_on_one_note_edit_requests req set
    status = case when p_approved then 'approved' else 'rejected' end,
    resolved_by = v_uid,
    resolved_at = now()
  where req.id = p_request_id;

  if p_approved then
    update public.one_on_one_meetings om
    set shared_notes = r.proposed_notes,
        updated_at = now()
    where om.id = r.meeting_id;
  end if;
end;
$$;

revoke all on function public.one_on_one_note_edit_request_resolve(uuid, boolean) from public;
grant execute on function public.one_on_one_note_edit_request_resolve(uuid, boolean) to authenticated;

create or replace function public.one_on_one_note_edit_requests_for_meeting(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if not v_hr and m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  return coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id', r.id,
         'requester_id', r.requester_id,
         'proposed_notes', r.proposed_notes,
         'status', r.status,
         'resolved_at', r.resolved_at,
         'created_at', r.created_at
       ) order by r.created_at desc
     )
     from public.one_on_one_note_edit_requests r
     where r.meeting_id = p_meeting_id),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_note_edit_requests_for_meeting(uuid) from public;
grant execute on function public.one_on_one_note_edit_requests_for_meeting(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- HR compliance
-- ---------------------------------------------------------------------------

create or replace function public.hr_one_on_one_compliance_list(
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_today date := current_date;
  s record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_filter is not null and p_filter not in ('all', 'overdue', 'due_soon', 'ok') then
    raise exception 'invalid filter';
  end if;

  select * into s from public.org_one_on_one_settings where org_id = v_org;
  if s is null then
    insert into public.org_one_on_one_settings (org_id) values (v_org) on conflict do nothing;
    select * into s from public.org_one_on_one_settings where org_id = v_org;
  end if;

  return coalesce(
    (select jsonb_agg(x.obj order by x.compliance_sort, x.report_name)
     from (
       select
         jsonb_build_object(
           'report_user_id', sub.report_user_id,
           'report_name', sub.report_name,
           'manager_user_id', sub.manager_user_id,
           'manager_name', sub.manager_name,
           'last_completed_at', sub.last_completed_at,
           'next_due_on', sub.next_due_on,
           'cadence_days', sub.cadence_days,
           'status', sub.compliance_status,
           'days_overdue', sub.days_overdue
         ) as obj,
         sub.compliance_sort,
         sub.report_name
       from (
         select
           p.id as report_user_id,
           p.full_name as report_name,
           mgr.id as manager_user_id,
           mgr.full_name as manager_name,
           lm.last_completed_at,
           cad.cadence_days,
           nd.next_due_on,
           case
             when v_today > nd.next_due_on then 'overdue'
             when nd.next_due_on >= v_today and nd.next_due_on <= v_today + s.due_soon_days then 'due_soon'
             else 'ok'
           end as compliance_status,
           case
             when v_today > nd.next_due_on then (v_today - nd.next_due_on)::integer
             else 0
           end as days_overdue,
           case
             when v_today > nd.next_due_on then 0
             when nd.next_due_on >= v_today and nd.next_due_on <= v_today + s.due_soon_days then 1
             else 2
           end as compliance_sort
         from public.profiles p
         join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = v_org
         cross join lateral (
           select public._one_on_one_effective_cadence_days(v_org, mgr.id, p.id) as cadence_days
         ) cad
         left join lateral (
           select max(m.completed_at)::date as last_completed_at
           from public.one_on_one_meetings m
           where m.org_id = v_org
             and m.manager_user_id = mgr.id
             and m.report_user_id = p.id
             and m.status = 'completed'
         ) lm on true
         cross join lateral (
           select (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date as next_due_on
         ) nd
         where p.org_id = v_org
           and p.status = 'active'
           and p.reports_to_user_id is not null
       ) sub
       where coalesce(p_filter, 'all') = 'all'
          or (p_filter = 'overdue' and sub.compliance_status = 'overdue')
          or (p_filter = 'due_soon' and sub.compliance_status = 'due_soon')
          or (p_filter = 'ok' and sub.compliance_status = 'ok')
     ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.hr_one_on_one_compliance_list(text) from public;
grant execute on function public.hr_one_on_one_compliance_list(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reminder enqueue (cron / Edge worker calls via service_role)
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_one_on_one_meeting_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  with org_cfg as (
    select o.id as org_id, coalesce(s.reminder_offsets_minutes, array[1440, 120]::integer[]) as offs
    from public.organisations o
    left join public.org_one_on_one_settings s on s.org_id = o.id
  ),
  cand as (
    select
      m.id as meeting_id,
      m.org_id,
      m.starts_at,
      u.offset_minutes
    from public.one_on_one_meetings m
    join org_cfg o on o.org_id = m.org_id
    cross join lateral unnest(coalesce(o.offs, array[1440, 120]::integer[])) as u(offset_minutes)
    left join public.one_on_one_pair_settings ps
      on ps.org_id = m.org_id
     and ps.manager_user_id = m.manager_user_id
     and ps.report_user_id = m.report_user_id
    where m.status in ('scheduled', 'in_progress')
      and coalesce(ps.reminders_enabled, true)
      and m.starts_at > now()
      and m.starts_at <= now() + interval '3 days'
      and now() >= m.starts_at - (u.offset_minutes * interval '1 minute')
      and now() < m.starts_at - (u.offset_minutes * interval '1 minute') + interval '30 minutes'
  ),
  new_rows as (
    insert into public.one_on_one_reminder_sent (meeting_id, offset_minutes, starts_at)
    select c.meeting_id, c.offset_minutes, c.starts_at
    from cand c
    on conflict (meeting_id, offset_minutes, starts_at) do nothing
    returning meeting_id, offset_minutes, starts_at
  ),
  job_ins as (
    insert into public.one_on_one_notification_jobs (org_id, event_type, meeting_id, payload)
    select
      m.org_id,
      'meeting_reminder',
      m.id,
      jsonb_build_object(
        'meeting_id', m.id,
        'starts_at', m.starts_at,
        'offset_minutes', c.offset_minutes,
        'manager_user_id', m.manager_user_id,
        'report_user_id', m.report_user_id
      )
    from new_rows nr
    join public.one_on_one_meetings m on m.id = nr.meeting_id
    join cand c
      on c.meeting_id = nr.meeting_id
     and c.offset_minutes = nr.offset_minutes
     and c.starts_at = nr.starts_at
    returning id
  )
  select count(*)::integer into n from job_ins;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.enqueue_one_on_one_meeting_reminders() from public;
grant execute on function public.enqueue_one_on_one_meeting_reminders() to service_role;

create or replace function public.enqueue_one_on_one_overdue_nudges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  v_today date := current_date;
begin
  with pairs as (
    select
      p.org_id,
      mgr.id as manager_user_id,
      p.id as report_user_id,
      coalesce(
        ps.cadence_days,
        (select s.default_cadence_days from public.org_one_on_one_settings s where s.org_id = p.org_id),
        14
      ) as cadence_days,
      lm.last_completed_at
    from public.profiles p
    join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = p.org_id
    left join public.one_on_one_pair_settings ps
      on ps.org_id = p.org_id
     and ps.manager_user_id = mgr.id
     and ps.report_user_id = p.id
    left join lateral (
      select max(m.completed_at)::date as last_completed_at
      from public.one_on_one_meetings m
      where m.org_id = p.org_id
        and m.manager_user_id = mgr.id
        and m.report_user_id = p.id
        and m.status = 'completed'
    ) lm on true
    where p.org_id is not null
      and p.status = 'active'
      and p.reports_to_user_id is not null
      and coalesce(ps.reminders_enabled, true)
  ),
  overdue_pairs as (
    select
      pr.org_id,
      pr.manager_user_id,
      pr.report_user_id
    from pairs pr
    where v_today > (
      coalesce(pr.last_completed_at, (select p2.created_at::date from public.profiles p2 where p2.id = pr.report_user_id))
      + (pr.cadence_days * interval '1 day')
    )::date
  ),
  ins_sent as (
    insert into public.one_on_one_overdue_nudge_sent (org_id, manager_user_id, report_user_id, nudge_date)
    select op.org_id, op.manager_user_id, op.report_user_id, v_today
    from overdue_pairs op
    on conflict (org_id, manager_user_id, report_user_id, nudge_date) do nothing
    returning org_id, manager_user_id, report_user_id
  ),
  job_ins as (
    insert into public.one_on_one_notification_jobs (org_id, event_type, meeting_id, payload)
    select
      i.org_id,
      'pair_overdue_nudge',
      null,
      jsonb_build_object(
        'manager_user_id', i.manager_user_id,
        'report_user_id', i.report_user_id,
        'nudge_date', v_today
      )
    from ins_sent i
    returning id
  )
  select count(*)::integer into n from job_ins;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.enqueue_one_on_one_overdue_nudges() from public;
grant execute on function public.enqueue_one_on_one_overdue_nudges() to service_role;

create or replace function public.one_on_one_notification_recipient_user_ids(p_job_id uuid)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  j record;
  m record;
begin
  select * into j from public.one_on_one_notification_jobs where id = p_job_id;
  if j is null then
    return;
  end if;

  if j.event_type = 'meeting_reminder' and j.meeting_id is not null then
    select manager_user_id, report_user_id into m
    from public.one_on_one_meetings where id = j.meeting_id;
    if m.manager_user_id is not null then
      user_id := m.manager_user_id;
      return next;
    end if;
    if m.report_user_id is not null then
      user_id := m.report_user_id;
      return next;
    end if;
    return;
  end if;

  if j.event_type = 'pair_overdue_nudge' then
    return query
    select (j.payload->>'manager_user_id')::uuid
    where (j.payload->>'manager_user_id') is not null;
    return;
  end if;

  return;
end;
$$;

revoke all on function public.one_on_one_notification_recipient_user_ids(uuid) from public;
grant execute on function public.one_on_one_notification_recipient_user_ids(uuid) to service_role;

comment on function public.one_on_one_notification_recipient_user_ids(uuid) is
  'Active profile IDs to notify for a one_on_one_notification_jobs row; service_role only (Edge worker).';

-- ---------------------------------------------------------------------------
-- HR dashboard stats: add 1:1 aggregates
-- ---------------------------------------------------------------------------

create or replace function public.hr_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_today date := current_date;
  v_result jsonb;
  v_s record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into v_s from public.org_one_on_one_settings where org_id = v_org;
  if v_s is null then
    insert into public.org_one_on_one_settings (org_id) values (v_org) on conflict do nothing;
    select * into v_s from public.org_one_on_one_settings where org_id = v_org;
  end if;

  select jsonb_build_object(
    'headcount_total',
      (select count(*) from public.profiles where org_id = v_org and status = 'active'),

    'by_contract',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object('contract_type', contract_type, 'count', count(*)) as row
           from public.employee_hr_records
           where org_id = v_org
           group by contract_type
           order by count(*) desc
         ) s),
        '[]'::jsonb
      ),

    'by_location',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object('work_location', work_location, 'count', count(*)) as row
           from public.employee_hr_records
           where org_id = v_org
           group by work_location
           order by count(*) desc
         ) s),
        '[]'::jsonb
      ),

    'missing_hr_records',
      (select count(*)
       from public.profiles p
       where p.org_id = v_org
         and p.status = 'active'
         and not exists (
           select 1 from public.employee_hr_records r where r.user_id = p.id and r.org_id = v_org
         )
      ),

    'onboarding_active',
      (select count(*) from public.onboarding_runs where org_id = v_org and status = 'active'),

    'probation_ending_soon',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'probation_end_date', r.probation_end_date
           ) as row
           from public.employee_hr_records r
           join public.profiles p on p.id = r.user_id
           where r.org_id = v_org
             and r.probation_end_date is not null
             and r.probation_end_date >= v_today
             and r.probation_end_date <= v_today + 60
           order by r.probation_end_date
         ) s),
        '[]'::jsonb
      ),

    'review_cycles_active',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'type', c.type,
             'total', count(pr.id),
             'completed', count(pr.id) filter (where pr.status = 'completed'),
             'manager_due', c.manager_assessment_due
           ) as row
           from public.review_cycles c
           left join public.performance_reviews pr on pr.cycle_id = c.id
           where c.org_id = v_org and c.status = 'active'
           group by c.id, c.name, c.type, c.manager_assessment_due
           order by c.created_at desc
         ) s),
        '[]'::jsonb
      ),

    'on_leave_today',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', lr.requester_id,
             'full_name', p.full_name,
             'kind', lr.kind,
             'end_date', lr.end_date
           ) as row
           from public.leave_requests lr
           join public.profiles p on p.id = lr.requester_id
           where lr.org_id = v_org
             and lr.status = 'approved'
             and lr.start_date <= v_today
             and lr.end_date >= v_today
           order by p.full_name
         ) s),
        '[]'::jsonb
      ),

    'bradford_alerts',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'spell_count', bf.spell_count,
             'total_days', bf.total_days,
             'bradford_score', bf.bradford_score
           ) as row
           from public.profiles p
           cross join lateral (
             select
               coalesce(bf_data.spell_count, 0) as spell_count,
               coalesce(bf_data.total_days, 0) as total_days,
               coalesce(bf_data.bradford_score, 0) as bradford_score
             from (
               select
                 count(spell) as spell_count,
                 sum(days) as total_days,
                 (count(spell) * count(spell) * sum(days))::int as bradford_score
               from (
                 select
                   min(sa.start_date) as spell,
                   sum(
                     (least(sa.end_date, v_today) - greatest(sa.start_date, v_today - (
                       select coalesce(bradford_window_days, 365)
                       from public.org_leave_settings ols where ols.org_id = v_org
                     )))::int + 1
                   ) as days
                 from public.sickness_absences sa
                 where sa.user_id = p.id
                   and sa.org_id = v_org
                   and sa.start_date >= (v_today - (
                     select coalesce(bradford_window_days, 365)
                       from public.org_leave_settings ols where ols.org_id = v_org
                   ))
                 group by
                   (select count(*) from public.sickness_absences sa2
                    where sa2.user_id = p.id and sa2.org_id = v_org
                      and sa2.end_date < sa.start_date
                      and sa2.end_date >= sa.start_date - 1)
               ) spell_data
             ) bf_data
           ) bf
           where p.org_id = v_org
             and p.status = 'active'
             and bf.bradford_score >= 200
           order by bf.bradford_score desc
           limit 10
         ) s),
        '[]'::jsonb
      ),

    'one_on_one_pairs_overdue',
      (select count(*)::integer
       from (
         select 1
         from public.profiles p
         join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = v_org
         cross join lateral (
           select public._one_on_one_effective_cadence_days(v_org, mgr.id, p.id) as cadence_days
         ) cad
         left join lateral (
           select max(m.completed_at)::date as last_completed_at
           from public.one_on_one_meetings m
           where m.org_id = v_org
             and m.manager_user_id = mgr.id
             and m.report_user_id = p.id
             and m.status = 'completed'
         ) lm on true
         where p.org_id = v_org
           and p.status = 'active'
           and p.reports_to_user_id is not null
           and v_today > (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date
       ) t
      ),

    'one_on_one_pairs_due_soon',
      (select count(*)::integer
       from (
         select 1
         from public.profiles p
         join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = v_org
         cross join lateral (
           select public._one_on_one_effective_cadence_days(v_org, mgr.id, p.id) as cadence_days
         ) cad
         left join lateral (
           select max(m.completed_at)::date as last_completed_at
           from public.one_on_one_meetings m
           where m.org_id = v_org
             and m.manager_user_id = mgr.id
             and m.report_user_id = p.id
             and m.status = 'completed'
         ) lm on true
         where p.org_id = v_org
           and p.status = 'active'
           and p.reports_to_user_id is not null
           and (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date <= v_today + v_s.due_soon_days
           and v_today <= (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date
           and not (
             v_today > (
               coalesce(lm.last_completed_at, p.created_at::date)
               + (cad.cadence_days * interval '1 day')
             )::date
           )
       ) t2
      )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hr_dashboard_stats() from public;
grant execute on function public.hr_dashboard_stats() to authenticated;