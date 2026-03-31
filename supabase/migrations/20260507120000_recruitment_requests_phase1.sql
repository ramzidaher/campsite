-- Phase 1 HR Recruitment: structured recruitment requests (tenant-scoped).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.recruitment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  job_title text not null,
  grade_level text not null,
  salary_band text not null,
  reason_for_hire text not null check (reason_for_hire in ('new_role', 'backfill')),
  start_date_needed date not null,
  contract_type text not null check (contract_type in ('full_time', 'part_time', 'seasonal')),
  ideal_candidate_profile text not null,
  specific_requirements text,
  status text not null default 'pending_review' check (
    status in ('pending_review', 'approved', 'in_progress', 'filled', 'rejected')
  ),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recruitment_requests_org_archived_created_idx
  on public.recruitment_requests (org_id, archived_at nulls first, created_at desc);

create index recruitment_requests_org_dept_idx
  on public.recruitment_requests (org_id, department_id);

create index recruitment_requests_org_status_idx
  on public.recruitment_requests (org_id, status);

create table public.recruitment_request_status_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.recruitment_requests (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid not null references public.profiles (id) on delete restrict,
  note text,
  created_at timestamptz not null default now()
);

create index recruitment_request_status_events_request_idx
  on public.recruitment_request_status_events (request_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Validation + timestamps
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_requests_validate_org_dept()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.departments d
    where d.id = new.department_id
      and d.org_id = new.org_id
  ) then
    raise exception 'department does not belong to organisation';
  end if;
  return new;
end;
$$;

create trigger recruitment_requests_validate_org_dept_trg
  before insert or update of department_id, org_id on public.recruitment_requests
  for each row
  execute procedure public.recruitment_requests_validate_org_dept();

create or replace function public.recruitment_requests_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recruitment_requests_updated_at_trg
  before update on public.recruitment_requests
  for each row
  execute procedure public.recruitment_requests_touch_updated_at();

create or replace function public.recruitment_requests_log_initial_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.recruitment_request_status_events (
    request_id,
    org_id,
    from_status,
    to_status,
    changed_by,
    note
  ) values (
    new.id,
    new.org_id,
    null,
    new.status,
    new.created_by,
    null
  );
  return new;
end;
$$;

create trigger recruitment_requests_after_insert_event_trg
  after insert on public.recruitment_requests
  for each row
  execute procedure public.recruitment_requests_log_initial_event();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.recruitment_requests enable row level security;
alter table public.recruitment_request_status_events enable row level security;

-- recruitment_requests: managers insert + read own; org admins read all. Updates via RPC only.

create policy recruitment_requests_select_org_admin
  on public.recruitment_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy recruitment_requests_select_manager_own
  on public.recruitment_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() = 'manager'
    and created_by = auth.uid()
  );

create policy recruitment_requests_insert_manager
  on public.recruitment_requests
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() = 'manager'
    and created_by = auth.uid()
    and exists (
      select 1
      from public.dept_managers dm
      where dm.user_id = auth.uid()
        and dm.dept_id = department_id
    )
  );

-- recruitment_request_status_events: readable when parent row is readable

create policy recruitment_request_status_events_select_org_admin
  on public.recruitment_request_status_events
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy recruitment_request_status_events_select_manager_own
  on public.recruitment_request_status_events
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() = 'manager'
    and exists (
      select 1
      from public.recruitment_requests r
      where r.id = recruitment_request_status_events.request_id
        and r.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_requests_pending_review_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_profile_role() in ('org_admin', 'super_admin') then (
      select count(*)::integer
      from public.recruitment_requests r
      where r.org_id = public.current_org_id()
        and r.archived_at is null
        and r.status = 'pending_review'
    )
    else 0
  end;
$$;

grant execute on function public.recruitment_requests_pending_review_count() to authenticated;

create or replace function public.set_recruitment_request_status(
  p_request_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_role text;
  rec public.recruitment_requests%rowtype;
  v_old text;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select role into v_role from public.profiles where id = v_viewer;
  if v_role is null or v_role not in ('org_admin', 'super_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into rec from public.recruitment_requests where id = p_request_id;
  if not found then
    raise exception 'recruitment request not found';
  end if;

  if rec.org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_status not in ('pending_review', 'approved', 'in_progress', 'filled', 'rejected')
  then
    raise exception 'invalid status';
  end if;

  v_old := rec.status;
  if v_old = p_new_status then
    return;
  end if;

  update public.recruitment_requests
  set
    status = p_new_status,
    archived_at = case
      when p_new_status in ('filled', 'rejected') then coalesce(rec.archived_at, now())
      else null
    end
  where id = p_request_id;

  insert into public.recruitment_request_status_events (
    request_id,
    org_id,
    from_status,
    to_status,
    changed_by,
    note
  ) values (
    p_request_id,
    rec.org_id,
    v_old,
    p_new_status,
    v_viewer,
    nullif(trim(p_note), '')
  );
end;
$$;

grant execute on function public.set_recruitment_request_status(uuid, text, text) to authenticated;
