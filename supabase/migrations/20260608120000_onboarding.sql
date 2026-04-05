-- Onboarding: templates, template tasks, active runs, run tasks.
-- Flow: offer signed → HR starts an onboarding run from a template →
--       tasks are copied with due dates → employee + manager tick them off.

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_templates_org_idx
  on public.onboarding_templates (org_id, is_archived, name);

comment on table public.onboarding_templates is
  'Reusable onboarding checklists. One per org can be marked is_default.';

-- Only one default per org
create unique index if not exists onboarding_templates_one_default_per_org
  on public.onboarding_templates (org_id)
  where is_default and not is_archived;

-- ---------------------------------------------------------------------------
-- Template tasks
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  title text not null,
  description text,
  assignee_type text not null default 'hr'
    check (assignee_type in ('employee', 'manager', 'hr')),
  category text not null default 'other'
    check (category in ('documents', 'it_setup', 'introductions', 'compliance', 'other')),
  due_offset_days integer not null default 1
    check (due_offset_days >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_template_tasks_template_idx
  on public.onboarding_template_tasks (template_id, sort_order);

comment on column public.onboarding_template_tasks.due_offset_days is
  'Days after employment_start_date when this task is due. 0 = day of start.';

-- ---------------------------------------------------------------------------
-- Onboarding runs (one per employee onboarding instance)
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.onboarding_templates (id) on delete set null,
  offer_id uuid references public.application_offers (id) on delete set null,
  employment_start_date date not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  completed_at timestamptz,
  cancelled_at timestamptz,
  started_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_runs_org_status_idx
  on public.onboarding_runs (org_id, status, created_at desc);

create index if not exists onboarding_runs_user_idx
  on public.onboarding_runs (user_id, created_at desc);

comment on table public.onboarding_runs is
  'Active onboarding instance for a specific employee. Tasks are copied from the chosen template.';

-- ---------------------------------------------------------------------------
-- Run tasks (live copy of template tasks for this run)
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_run_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.onboarding_runs (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  template_task_id uuid references public.onboarding_template_tasks (id) on delete set null,
  title text not null,
  description text,
  assignee_type text not null default 'hr'
    check (assignee_type in ('employee', 'manager', 'hr')),
  category text not null default 'other'
    check (category in ('documents', 'it_setup', 'introductions', 'compliance', 'other')),
  due_date date,
  sort_order integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_run_tasks_run_idx
  on public.onboarding_run_tasks (run_id, sort_order);

-- ---------------------------------------------------------------------------
-- Timestamps triggers
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_touch_updated_at()
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

drop trigger if exists onboarding_templates_updated_at_trg on public.onboarding_templates;
create trigger onboarding_templates_updated_at_trg
  before update on public.onboarding_templates
  for each row execute procedure public.onboarding_touch_updated_at();

drop trigger if exists onboarding_runs_updated_at_trg on public.onboarding_runs;
create trigger onboarding_runs_updated_at_trg
  before update on public.onboarding_runs
  for each row execute procedure public.onboarding_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_tasks enable row level security;
alter table public.onboarding_runs enable row level security;
alter table public.onboarding_run_tasks enable row level security;

-- Templates: HR managers can read & write
drop policy if exists onboarding_templates_select on public.onboarding_templates;
create policy onboarding_templates_select
  on public.onboarding_templates for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

drop policy if exists onboarding_templates_all on public.onboarding_templates;
create policy onboarding_templates_all
  on public.onboarding_templates for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

drop policy if exists onboarding_template_tasks_all on public.onboarding_template_tasks;
create policy onboarding_template_tasks_all
  on public.onboarding_template_tasks for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_templates', '{}'::jsonb)
  );

-- Runs: HR managers (manage_runs) can read all; employees can read their own
drop policy if exists onboarding_runs_select_manage on public.onboarding_runs;
create policy onboarding_runs_select_manage
  on public.onboarding_runs for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
  );

drop policy if exists onboarding_runs_select_own on public.onboarding_runs;
create policy onboarding_runs_select_own
  on public.onboarding_runs for select to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
  );

-- Run tasks: HR managers or the employee themselves
drop policy if exists onboarding_run_tasks_select_manage on public.onboarding_run_tasks;
create policy onboarding_run_tasks_select_manage
  on public.onboarding_run_tasks for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
  );

drop policy if exists onboarding_run_tasks_select_own on public.onboarding_run_tasks;
create policy onboarding_run_tasks_select_own
  on public.onboarding_run_tasks for select to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.onboarding_runs r
      where r.id = run_id and r.user_id = auth.uid()
    )
  );

-- Task updates go through RPC only (security definer)
drop policy if exists onboarding_run_tasks_update on public.onboarding_run_tasks;
create policy onboarding_run_tasks_update
  on public.onboarding_run_tasks for update to authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- RPC: start onboarding run
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_run_start(
  p_user_id uuid,
  p_template_id uuid,
  p_employment_start_date date,
  p_offer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_run_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'onboarding.manage_runs', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and org_id = v_org) then
    raise exception 'target user not in org';
  end if;

  if not exists (select 1 from public.onboarding_templates where id = p_template_id and org_id = v_org and not is_archived) then
    raise exception 'template not found';
  end if;

  if p_offer_id is not null and not exists (
    select 1 from public.application_offers where id = p_offer_id and org_id = v_org
  ) then
    raise exception 'offer not in org';
  end if;

  -- create the run
  insert into public.onboarding_runs (
    org_id, user_id, template_id, offer_id, employment_start_date, started_by
  ) values (
    v_org, p_user_id, p_template_id, p_offer_id, p_employment_start_date, v_uid
  )
  returning id into v_run_id;

  -- copy tasks from template
  insert into public.onboarding_run_tasks (
    run_id, org_id, template_task_id, title, description,
    assignee_type, category, due_date, sort_order
  )
  select
    v_run_id,
    v_org,
    t.id,
    t.title,
    t.description,
    t.assignee_type,
    t.category,
    p_employment_start_date + (t.due_offset_days || ' days')::interval,
    t.sort_order
  from public.onboarding_template_tasks t
  where t.template_id = p_template_id
  order by t.sort_order;

  return v_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: complete or skip a run task
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_task_update(
  p_task_id uuid,
  p_status text   -- 'completed' | 'skipped' | 'pending'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_run public.onboarding_runs;
  v_task public.onboarding_run_tasks;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('completed', 'skipped', 'pending') then raise exception 'invalid status'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_task from public.onboarding_run_tasks where id = p_task_id and org_id = v_org;
  if v_task.id is null then raise exception 'task not found'; end if;

  select * into v_run from public.onboarding_runs where id = v_task.run_id;

  -- allowed if: HR manager, or the employee (for their own employee-assignee tasks)
  if not (
    public.has_permission(v_uid, v_org, 'onboarding.manage_runs', '{}'::jsonb)
    or (
      v_run.user_id = v_uid
      and v_task.assignee_type = 'employee'
      and public.has_permission(v_uid, v_org, 'onboarding.complete_own_tasks', '{}'::jsonb)
    )
  ) then
    raise exception 'not allowed';
  end if;

  update public.onboarding_run_tasks set
    status = p_status,
    completed_at = case when p_status in ('completed', 'skipped') then now() else null end,
    completed_by = case when p_status in ('completed', 'skipped') then v_uid else null end
  where id = p_task_id;

  -- auto-complete the run if all tasks are done
  if p_status in ('completed', 'skipped') then
    if not exists (
      select 1 from public.onboarding_run_tasks
      where run_id = v_run.id and status = 'pending'
    ) then
      update public.onboarding_runs
      set status = 'completed', completed_at = now()
      where id = v_run.id and status = 'active';
    end if;
  else
    -- re-opened a task: make sure run is active again
    update public.onboarding_runs
    set status = 'active', completed_at = null
    where id = v_run.id and status = 'completed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel a run
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_run_cancel(p_run_id uuid)
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'onboarding.manage_runs', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  update public.onboarding_runs
  set status = 'cancelled', cancelled_at = now()
  where id = p_run_id and org_id = v_org and status = 'active';
end;
$$;
