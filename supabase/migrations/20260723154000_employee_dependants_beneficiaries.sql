-- Dependants / beneficiary information for employee records and self-service.

create table if not exists public.employee_dependants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  date_of_birth date null,
  is_student boolean not null default false,
  is_disabled boolean not null default false,
  is_beneficiary boolean not null default false,
  beneficiary_percentage numeric(5,2) null,
  phone text null,
  email text null,
  address text null,
  notes text null,
  is_emergency_contact boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  updated_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_dependants_beneficiary_percentage_range
    check (
      beneficiary_percentage is null
      or (beneficiary_percentage >= 0 and beneficiary_percentage <= 100)
    ),
  constraint employee_dependants_beneficiary_percentage_required
    check (
      (is_beneficiary = false and beneficiary_percentage is null)
      or (is_beneficiary = true and beneficiary_percentage is not null)
    )
);

create index if not exists employee_dependants_org_user_idx
  on public.employee_dependants(org_id, user_id, created_at desc);

comment on table public.employee_dependants is
  'Employee dependant records including beneficiary allocations.';

create or replace function public.employee_dependants_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_dependants_set_updated_at_trg on public.employee_dependants;
create trigger employee_dependants_set_updated_at_trg
before update on public.employee_dependants
for each row execute function public.employee_dependants_set_updated_at();

alter table public.employee_dependants enable row level security;

revoke all on public.employee_dependants from public;
grant select, insert, update, delete on public.employee_dependants to authenticated;

drop policy if exists employee_dependants_select on public.employee_dependants;
create policy employee_dependants_select
on public.employee_dependants for select
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
        where p.id = employee_dependants.user_id
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

drop policy if exists employee_dependants_insert on public.employee_dependants;
create policy employee_dependants_insert
on public.employee_dependants for insert
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

drop policy if exists employee_dependants_update on public.employee_dependants;
create policy employee_dependants_update
on public.employee_dependants for update
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

drop policy if exists employee_dependants_delete on public.employee_dependants;
create policy employee_dependants_delete
on public.employee_dependants for delete
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

create or replace function public.employee_dependants_replace(
  p_user_id uuid,
  p_dependants jsonb
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
  v_beneficiary_count integer := 0;
  v_beneficiary_sum numeric := 0;
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

  v_can_manage := public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb);
  v_is_self := p_user_id = v_uid and public.has_permission(v_uid, v_org, 'hr.view_own', '{}'::jsonb);

  if not v_can_manage and not v_is_self then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_dependants is null or jsonb_typeof(p_dependants) <> 'array' then
    raise exception 'Dependants payload must be an array';
  end if;

  select
    count(*) filter (where coalesce((d->>'is_beneficiary')::boolean, false) = true),
    coalesce(sum(
      case
        when coalesce((d->>'is_beneficiary')::boolean, false) = true
          then coalesce((d->>'beneficiary_percentage')::numeric, 0)
        else 0
      end
    ), 0)
  into v_beneficiary_count, v_beneficiary_sum
  from jsonb_array_elements(p_dependants) as d;

  if v_beneficiary_count > 0 and abs(v_beneficiary_sum - 100) > 0.001 then
    raise exception 'Beneficiary allocations must total exactly 100%% (current: %)', v_beneficiary_sum;
  end if;

  delete from public.employee_dependants
  where org_id = v_org
    and user_id = p_user_id;

  insert into public.employee_dependants (
    org_id,
    user_id,
    full_name,
    relationship,
    date_of_birth,
    is_student,
    is_disabled,
    is_beneficiary,
    beneficiary_percentage,
    phone,
    email,
    address,
    notes,
    is_emergency_contact,
    metadata,
    created_by,
    updated_by
  )
  select
    v_org,
    p_user_id,
    nullif(trim(d->>'full_name'), ''),
    coalesce(nullif(trim(d->>'relationship'), ''), 'other'),
    nullif(d->>'date_of_birth', '')::date,
    coalesce((d->>'is_student')::boolean, false),
    coalesce((d->>'is_disabled')::boolean, false),
    coalesce((d->>'is_beneficiary')::boolean, false),
    case
      when coalesce((d->>'is_beneficiary')::boolean, false)
        then coalesce(nullif(d->>'beneficiary_percentage', '')::numeric, 0)
      else null
    end,
    nullif(trim(d->>'phone'), ''),
    nullif(trim(d->>'email'), ''),
    nullif(trim(d->>'address'), ''),
    nullif(trim(d->>'notes'), ''),
    coalesce((d->>'is_emergency_contact')::boolean, false),
    coalesce(d->'metadata', '{}'::jsonb),
    v_uid,
    v_uid
  from jsonb_array_elements(p_dependants) as d
  where nullif(trim(d->>'full_name'), '') is not null;
end;
$$;

revoke all on function public.employee_dependants_replace(uuid, jsonb) from public;
grant execute on function public.employee_dependants_replace(uuid, jsonb) to authenticated;
