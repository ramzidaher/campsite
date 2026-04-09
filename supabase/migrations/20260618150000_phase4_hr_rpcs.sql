-- Phase 4: HR backend RPCs
-- 4.1 onboarding_template_task_upsert
-- 4.2 onboarding_template_task_delete
-- 4.3 review_cycle_create
-- 4.4 interview_joining_instructions_set
-- 4.5 hr_employee_file multi-tier access — already shipped in 20260618130000_phase2_hr_permissions.sql

-- ---------------------------------------------------------------------------
-- 4.1 onboarding_template_task_upsert
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_template_task_upsert(
  p_template_id uuid,
  p_title text,
  p_description text default null,
  p_assignee_type text default 'hr',
  p_category text default 'other',
  p_due_offset_days integer default 1,
  p_sort_order integer default null,
  p_task_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_tid     uuid;
  v_next_so integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'onboarding.manage_templates', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.onboarding_templates t
    where t.id = p_template_id and t.org_id = v_org
  ) then
    raise exception 'template not found';
  end if;

  if p_assignee_type not in ('employee', 'manager', 'hr') then
    raise exception 'invalid assignee_type';
  end if;
  if p_category not in ('documents', 'it_setup', 'introductions', 'compliance', 'other') then
    raise exception 'invalid category';
  end if;
  if p_due_offset_days is null or p_due_offset_days < 0 then
    raise exception 'invalid due_offset_days';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  if p_task_id is null then
    v_next_so := coalesce(p_sort_order, (
      select coalesce(max(sort_order), -1) + 1
      from public.onboarding_template_tasks
      where template_id = p_template_id
    ));

    insert into public.onboarding_template_tasks (
      template_id, org_id, title, description,
      assignee_type, category, due_offset_days, sort_order
    ) values (
      p_template_id, v_org, trim(p_title),
      nullif(trim(coalesce(p_description, '')), ''),
      p_assignee_type, p_category, p_due_offset_days, v_next_so
    )
    returning id into v_tid;
  else
    update public.onboarding_template_tasks t set
      title           = trim(p_title),
      description     = nullif(trim(coalesce(p_description, '')), ''),
      assignee_type   = p_assignee_type,
      category        = p_category,
      due_offset_days = p_due_offset_days,
      sort_order      = coalesce(p_sort_order, t.sort_order)
    where t.id = p_task_id
      and t.template_id = p_template_id
      and t.org_id = v_org
    returning t.id into v_tid;

    if v_tid is null then
      raise exception 'task not found';
    end if;
  end if;

  return v_tid;
end;
$$;

revoke all on function public.onboarding_template_task_upsert(uuid, text, text, text, text, integer, integer, uuid) from public;
grant execute on function public.onboarding_template_task_upsert(uuid, text, text, text, text, integer, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4.2 onboarding_template_task_delete
-- ---------------------------------------------------------------------------

create or replace function public.onboarding_template_task_delete(p_task_id uuid)
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'onboarding.manage_templates', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.onboarding_template_tasks t
    where t.id = p_task_id and t.org_id = v_org
  ) then
    raise exception 'task not found';
  end if;

  if exists (
    select 1
    from public.onboarding_run_tasks ort
    join public.onboarding_runs r on r.id = ort.run_id
    where ort.template_task_id = p_task_id
      and r.org_id = v_org
      and r.status = 'active'
  ) then
    raise exception 'task is referenced by an active onboarding run';
  end if;

  delete from public.onboarding_template_tasks t
  where t.id = p_task_id and t.org_id = v_org;
end;
$$;

revoke all on function public.onboarding_template_task_delete(uuid) from public;
grant execute on function public.onboarding_template_task_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4.3 review_cycle_create
-- ---------------------------------------------------------------------------

create or replace function public.review_cycle_create(
  p_name text,
  p_type text,
  p_period_start date,
  p_period_end date,
  p_self_assessment_due date default null,
  p_manager_assessment_due date default null
)
returns public.review_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.review_cycles%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'performance.manage_cycles', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_type not in ('annual', 'mid_year', 'probation', 'quarterly') then
    raise exception 'invalid type';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  if p_period_start is null or p_period_end is null then
    raise exception 'period dates required';
  end if;

  if p_period_start >= p_period_end then
    raise exception 'period_start must be before period_end';
  end if;

  if p_self_assessment_due is not null
     and p_manager_assessment_due is not null
     and p_self_assessment_due > p_manager_assessment_due then
    raise exception 'self_assessment_due must be on or before manager_assessment_due';
  end if;

  insert into public.review_cycles (
    org_id, name, type, status,
    period_start, period_end,
    self_assessment_due, manager_assessment_due,
    created_by
  ) values (
    v_org,
    trim(p_name),
    p_type,
    'draft',
    p_period_start,
    p_period_end,
    p_self_assessment_due,
    p_manager_assessment_due,
    v_uid
  )
  returning * into strict v_row;

  return v_row;
end;
$$;

revoke all on function public.review_cycle_create(text, text, date, date, date, date) from public;
grant execute on function public.review_cycle_create(text, text, date, date, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4.4 interview_joining_instructions_set
-- ---------------------------------------------------------------------------

create or replace function public.interview_joining_instructions_set(
  p_application_id uuid,
  p_instructions text default null
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'interviews.manage', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.job_applications ja
    where ja.id = p_application_id and ja.org_id = v_org
  ) then
    raise exception 'application not found';
  end if;

  update public.job_applications ja
  set interview_joining_instructions = nullif(trim(coalesce(p_instructions, '')), '')
  where ja.id = p_application_id
    and ja.org_id = v_org;
end;
$$;

revoke all on function public.interview_joining_instructions_set(uuid, text) from public;
grant execute on function public.interview_joining_instructions_set(uuid, text) to authenticated;
