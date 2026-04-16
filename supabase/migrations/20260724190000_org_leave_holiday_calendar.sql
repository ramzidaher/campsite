-- Org holiday calendar periods (bank/public/custom breaks) excluded from leave counts.

create table if not exists public.org_leave_holiday_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  holiday_kind text not null default 'custom'
    check (holiday_kind in ('bank_holiday', 'public_holiday', 'org_break', 'custom')),
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_org_leave_holiday_periods_org_dates
  on public.org_leave_holiday_periods (org_id, start_date, end_date);

create index if not exists idx_org_leave_holiday_periods_org_active
  on public.org_leave_holiday_periods (org_id, is_active, start_date);

create or replace function public.org_leave_holiday_periods_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_org_leave_holiday_periods_updated_at
before update on public.org_leave_holiday_periods
for each row execute function public.org_leave_holiday_periods_set_updated_at();

alter table public.org_leave_holiday_periods enable row level security;

drop policy if exists leave_holidays_select_active_org_members on public.org_leave_holiday_periods;
create policy leave_holidays_select_active_org_members
on public.org_leave_holiday_periods
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.org_id = org_leave_holiday_periods.org_id
      and p.status = 'active'
  )
);

drop policy if exists leave_holidays_manage_org_admins on public.org_leave_holiday_periods;
create policy leave_holidays_manage_org_admins
on public.org_leave_holiday_periods
for all
to authenticated
using (
  public.has_permission(auth.uid(), org_leave_holiday_periods.org_id, 'leave.manage_org', '{}'::jsonb)
)
with check (
  public.has_permission(auth.uid(), org_leave_holiday_periods.org_id, 'leave.manage_org', '{}'::jsonb)
);

create or replace function public.leave_org_is_holiday(
  p_org_id uuid,
  p_day date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.org_leave_holiday_periods h
    where h.org_id = p_org_id
      and h.is_active
      and p_day between h.start_date and h.end_date
  );
$$;

create or replace function public.leave_request_duration_days(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_half_day_portion text default null
)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_use_working boolean := false;
  v_non_working smallint[] := array[6, 7]::smallint[];
  v_d date;
  v_iso smallint;
  v_days numeric := 0;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return 0;
  end if;
  if p_half_day_portion is not null then
    if p_half_day_portion not in ('am', 'pm') then
      raise exception 'invalid half-day portion';
    end if;
    if p_start <> p_end then
      raise exception 'half-day requests must use a single date';
    end if;
    if public.leave_org_is_holiday(p_org_id, p_start) then
      return 0;
    end if;
    select coalesce(ols.leave_use_working_days, false), coalesce(ols.non_working_iso_dows, array[6, 7]::smallint[])
    into v_use_working, v_non_working
    from public.org_leave_settings ols
    where ols.org_id = p_org_id;
    if v_use_working then
      v_iso := extract(isodow from p_start)::smallint;
      if v_non_working @> array[v_iso]::smallint[] then
        return 0;
      end if;
    end if;
    return 0.5;
  end if;

  select coalesce(ols.leave_use_working_days, false), coalesce(ols.non_working_iso_dows, array[6, 7]::smallint[])
  into v_use_working, v_non_working
  from public.org_leave_settings ols
  where ols.org_id = p_org_id;

  v_d := p_start;
  while v_d <= p_end loop
    if not public.leave_org_is_holiday(p_org_id, v_d) then
      if not v_use_working then
        v_days := v_days + 1;
      else
        v_iso := extract(isodow from v_d)::smallint;
        if not (v_non_working @> array[v_iso]::smallint[]) then
          v_days := v_days + 1;
        end if;
      end if;
    end if;
    v_d := v_d + 1;
  end loop;

  return v_days;
end;
$$;

revoke all on function public.leave_org_is_holiday(uuid, date) from public;
grant execute on function public.leave_org_is_holiday(uuid, date) to authenticated;
