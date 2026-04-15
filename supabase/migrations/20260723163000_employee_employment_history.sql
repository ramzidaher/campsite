-- Employment history (previous roles within organisation) with scoped RBAC.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.employment_history.view_all', 'View employment history (all)', 'View employment history timelines for all employees.', false),
  ('hr.employment_history.manage_all', 'Manage employment history (all)', 'Create, edit, and delete employment history timelines for all employees.', false),
  ('hr.employment_history.view_own', 'View own employment history', 'View your own employment history timeline.', false),
  ('hr.employment_history.manage_own', 'Manage own employment history', 'Submit and maintain your own employment history timeline.', false)
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
    ('hr.view_records', 'hr.employment_history.view_all'),
    ('hr.manage_records', 'hr.employment_history.view_all'),
    ('hr.manage_records', 'hr.employment_history.manage_all'),
    ('hr.view_own', 'hr.employment_history.view_own'),
    ('hr.view_own', 'hr.employment_history.manage_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_employment_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_title text not null,
  department_name text null,
  team_name text null,
  manager_name text null,
  employment_type text null,
  contract_type text null,
  fte numeric(5,2) null,
  location_type text null,
  start_date date not null,
  end_date date null,
  change_reason text null,
  pay_grade text null,
  salary_band text null,
  notes text null,
  source text not null default 'manual'
    check (source in ('manual', 'auto_from_hr_record', 'employee_request')),
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_employment_history_end_after_start
    check (end_date is null or end_date >= start_date),
  constraint employee_employment_history_fte_range
    check (fte is null or (fte >= 0 and fte <= 1.5))
);

create index if not exists employee_employment_history_org_user_start_idx
  on public.employee_employment_history(org_id, user_id, start_date desc, created_at desc);

create or replace function public.employee_employment_history_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_employment_history_set_updated_at_trg on public.employee_employment_history;
create trigger employee_employment_history_set_updated_at_trg
before update on public.employee_employment_history
for each row execute function public.employee_employment_history_set_updated_at();

alter table public.employee_employment_history enable row level security;

revoke all on public.employee_employment_history from public;
grant select, insert, update, delete on public.employee_employment_history to authenticated;

drop policy if exists employee_employment_history_select on public.employee_employment_history;
create policy employee_employment_history_select
on public.employee_employment_history for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.employment_history.view_all', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1
        from public.profiles p
        where p.id = employee_employment_history.user_id
          and p.org_id = org_id
          and p.reports_to_user_id is not distinct from auth.uid()
      )
    )
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.employment_history.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_employment_history_insert on public.employee_employment_history;
create policy employee_employment_history_insert
on public.employee_employment_history for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_employment_history_update on public.employee_employment_history;
create policy employee_employment_history_update
on public.employee_employment_history for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_own', '{}'::jsonb)
    )
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_employment_history_delete on public.employee_employment_history;
create policy employee_employment_history_delete
on public.employee_employment_history for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_all', '{}'::jsonb)
    or (
      user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.employment_history.manage_own', '{}'::jsonb)
    )
  )
);

create or replace function public.employee_employment_history_replace(
  p_user_id uuid,
  p_history jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_can_manage boolean := false;
  v_is_self boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  if v_org is null then
    raise exception 'Target employee not found';
  end if;

  v_can_manage := public.has_permission(v_uid, v_org, 'hr.employment_history.manage_all', '{}'::jsonb);
  v_is_self := p_user_id = v_uid and public.has_permission(v_uid, v_org, 'hr.employment_history.manage_own', '{}'::jsonb);

  if not v_can_manage and not v_is_self then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_history is null or jsonb_typeof(p_history) <> 'array' then
    raise exception 'Employment history payload must be an array';
  end if;

  delete from public.employee_employment_history
  where org_id = v_org
    and user_id = p_user_id;

  insert into public.employee_employment_history (
    org_id,
    user_id,
    role_title,
    department_name,
    team_name,
    manager_name,
    employment_type,
    contract_type,
    fte,
    location_type,
    start_date,
    end_date,
    change_reason,
    pay_grade,
    salary_band,
    notes,
    source,
    created_by,
    updated_by
  )
  select
    v_org,
    p_user_id,
    nullif(trim(e->>'role_title'), ''),
    nullif(trim(e->>'department_name'), ''),
    nullif(trim(e->>'team_name'), ''),
    nullif(trim(e->>'manager_name'), ''),
    nullif(trim(e->>'employment_type'), ''),
    nullif(trim(e->>'contract_type'), ''),
    nullif(e->>'fte', '')::numeric,
    nullif(trim(e->>'location_type'), ''),
    nullif(e->>'start_date', '')::date,
    nullif(e->>'end_date', '')::date,
    nullif(trim(e->>'change_reason'), ''),
    nullif(trim(e->>'pay_grade'), ''),
    nullif(trim(e->>'salary_band'), ''),
    nullif(trim(e->>'notes'), ''),
    coalesce(nullif(trim(e->>'source'), ''), case when v_is_self then 'employee_request' else 'manual' end),
    v_uid,
    v_uid
  from jsonb_array_elements(p_history) as e
  where nullif(trim(e->>'role_title'), '') is not null
    and nullif(e->>'start_date', '') is not null;
end;
$$;

revoke all on function public.employee_employment_history_replace(uuid, jsonb) from public;
grant execute on function public.employee_employment_history_replace(uuid, jsonb) to authenticated;
