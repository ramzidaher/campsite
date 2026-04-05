-- Annual leave, TOIL requests (line manager approval via reports_to), sickness absences, Bradford factor (S²×D).

-- ---------------------------------------------------------------------------
-- profiles.reports_to_user_id
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists reports_to_user_id uuid references public.profiles (id) on delete set null;

create index if not exists profiles_reports_to_user_id_idx
  on public.profiles (reports_to_user_id)
  where reports_to_user_id is not null;

comment on column public.profiles.reports_to_user_id is
  'Line manager for leave approval; must be same org and not self.';

create or replace function public.profiles_reports_to_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reports_to_user_id is null then
    return new;
  end if;
  if new.reports_to_user_id = new.id then
    raise exception 'reports_to_user_id cannot equal id';
  end if;
  if not exists (
    select 1 from public.profiles m
    where m.id = new.reports_to_user_id
      and m.org_id is not distinct from new.org_id
      and m.org_id is not null
  ) then
    raise exception 'reports_to must be a profile in the same organisation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_reports_to_guard_trg on public.profiles;
create trigger profiles_reports_to_guard_trg
  before insert or update of reports_to_user_id, org_id, id
  on public.profiles
  for each row
  execute procedure public.profiles_reports_to_guard();

-- ---------------------------------------------------------------------------
-- org_leave_settings
-- ---------------------------------------------------------------------------

create table if not exists public.org_leave_settings (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  bradford_window_days integer not null default 365
    check (bradford_window_days > 0 and bradford_window_days <= 3660),
  leave_year_start_month smallint not null default 1
    check (leave_year_start_month between 1 and 12),
  leave_year_start_day smallint not null default 1
    check (leave_year_start_day between 1 and 31),
  updated_at timestamptz not null default now()
);

comment on table public.org_leave_settings is
  'Per-org leave / Bradford settings. Calendar leave year MVP uses leave_year_start_* for labelling only; accrual engine can extend later.';

alter table public.org_leave_settings enable row level security;

drop policy if exists org_leave_settings_select on public.org_leave_settings;
create policy org_leave_settings_select
  on public.org_leave_settings
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'leave.view_own', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    )
  );

-- Mutations via RPC only (no insert policy for generic clients)

-- ---------------------------------------------------------------------------
-- leave_allowances (calendar year key YYYY; TOIL balance per row)
-- ---------------------------------------------------------------------------

create table if not exists public.leave_allowances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_year text not null,
  annual_entitlement_days numeric(10, 2) not null default 0
    check (annual_entitlement_days >= 0),
  toil_balance_days numeric(10, 2) not null default 0
    check (toil_balance_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, leave_year)
);

create index if not exists leave_allowances_org_user_idx
  on public.leave_allowances (org_id, user_id);

comment on table public.leave_allowances is
  'Annual entitlement cap (days) and TOIL balance (days) per user per calendar leave year.';

alter table public.leave_allowances enable row level security;

drop policy if exists leave_allowances_select on public.leave_allowances;
create policy leave_allowances_select
  on public.leave_allowances
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.view_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = leave_allowances.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('annual', 'toil')),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists leave_requests_org_status_idx
  on public.leave_requests (org_id, status);
create index if not exists leave_requests_requester_idx
  on public.leave_requests (requester_id);
create index if not exists leave_requests_org_dates_idx
  on public.leave_requests (org_id, start_date, end_date);

comment on table public.leave_requests is
  'Annual leave and TOIL booking requests; approval by reports_to line manager or org leave.manage_org.';

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select
  on public.leave_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      requester_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.view_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = leave_requests.requester_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- sickness_absences (Bradford input; not leave balance)
-- ---------------------------------------------------------------------------

create table if not exists public.sickness_absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists sickness_absences_org_user_idx
  on public.sickness_absences (org_id, user_id);
create index if not exists sickness_absences_org_dates_idx
  on public.sickness_absences (org_id, start_date, end_date);

comment on table public.sickness_absences is
  'Sickness / unplanned absence episodes for Bradford factor; separate from annual leave and TOIL.';

alter table public.sickness_absences enable row level security;

drop policy if exists sickness_absences_select on public.sickness_absences;
create policy sickness_absences_select
  on public.sickness_absences
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.view_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = sickness_absences.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------------

create or replace function public.leave_calendar_days_inclusive(p_start date, p_end date)
returns numeric
language sql
immutable
as $$
  select (p_end - p_start + 1)::numeric;
$$;

create or replace function public.leave_calendar_year_key(p_org_id uuid, p_d date)
returns text
language sql
immutable
as $$
  -- MVP: calendar year key; org_leave_settings leave_year_start_* reserved for future accrual periods.
  select extract(year from p_d)::text;
$$;

create or replace function public.leave_sum_request_days(
  p_org_id uuid,
  p_user_id uuid,
  p_kind text,
  p_year_key text,
  p_statuses text[],
  p_exclude_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.leave_calendar_days_inclusive(r.start_date, r.end_date)), 0)::numeric
  from public.leave_requests r
  where r.org_id = p_org_id
    and r.requester_id = p_user_id
    and r.kind = p_kind
    and r.status = any (p_statuses)
    and public.leave_calendar_year_key(p_org_id, r.start_date) = p_year_key
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id);
$$;

create or replace function public.leave_pending_toil_days_excluding(
  p_org_id uuid,
  p_user_id uuid,
  p_year_key text,
  p_exclude_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.leave_calendar_days_inclusive(r.start_date, r.end_date)), 0)::numeric
  from public.leave_requests r
  where r.org_id = p_org_id
    and r.requester_id = p_user_id
    and r.kind = 'toil'
    and r.status = 'pending'
    and public.leave_calendar_year_key(p_org_id, r.start_date) = p_year_key
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id);
$$;

create or replace function public.leave_can_decide_request(p_viewer uuid, p_request_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_requester uuid;
begin
  select r.org_id, r.requester_id
  into v_org, v_requester
  from public.leave_requests r
  where r.id = p_request_id;

  if v_org is null then
    return false;
  end if;

  if public.has_permission(p_viewer, v_org, 'leave.manage_org', '{}'::jsonb) then
    return true;
  end if;

  if not public.has_permission(p_viewer, v_org, 'leave.approve_direct_reports', '{}'::jsonb) then
    return false;
  end if;

  return exists (
    select 1 from public.profiles s
    where s.id = v_requester
      and s.org_id = v_org
      and s.reports_to_user_id = p_viewer
  );
end;
$$;

create or replace function public.leave_ensure_allowance_row(
  p_org_id uuid,
  p_user_id uuid,
  p_year_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leave_allowances (org_id, user_id, leave_year)
  values (p_org_id, p_user_id, p_year_key)
  on conflict (org_id, user_id, leave_year) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit / decide / cancel
-- ---------------------------------------------------------------------------

create or replace function public.leave_request_submit(
  p_kind text,
  p_start date,
  p_end date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_yk text;
  v_days numeric;
  v_ent numeric;
  v_used_pending numeric;
  v_bal numeric;
  v_pending_toil numeric;
  rid uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org profile';
  end if;

  if not public.has_permission(v_uid, v_org, 'leave.submit', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_kind not in ('annual', 'toil') then
    raise exception 'invalid kind';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid dates';
  end if;

  v_days := public.leave_calendar_days_inclusive(p_start, p_end);
  v_yk := public.leave_calendar_year_key(v_org, p_start);

  perform public.leave_ensure_allowance_row(v_org, v_uid, v_yk);

  if p_kind = 'annual' then
    select la.annual_entitlement_days into v_ent
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_uid and la.leave_year = v_yk;

    v_used_pending :=
      public.leave_sum_request_days(v_org, v_uid, 'annual', v_yk, array['pending', 'approved']::text[], null);

    if v_used_pending + v_days > coalesce(v_ent, 0) then
      raise exception 'annual leave would exceed entitlement for leave year %', v_yk;
    end if;
  else
    select la.toil_balance_days into v_bal
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_uid and la.leave_year = v_yk;

    v_pending_toil := public.leave_pending_toil_days_excluding(v_org, v_uid, v_yk, null);
    if coalesce(v_bal, 0) - v_pending_toil < v_days then
      raise exception 'insufficient TOIL balance';
    end if;
  end if;

  insert into public.leave_requests (
    org_id, requester_id, kind, start_date, end_date, status, note
  )
  values (
    v_org, v_uid, p_kind, p_start, p_end, 'pending', nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into rid;

  return rid;
end;
$$;

create or replace function public.leave_request_decide(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_requester uuid;
  v_kind text;
  v_start date;
  v_end date;
  v_status text;
  v_days numeric;
  v_yk text;
  v_ent numeric;
  v_used_other numeric;
  v_bal numeric;
  v_pending_toil numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.leave_can_decide_request(v_uid, p_request_id) then
    raise exception 'not allowed';
  end if;

  select org_id, requester_id, kind, start_date, end_date, status
  into v_org, v_requester, v_kind, v_start, v_end, v_status
  from public.leave_requests
  where id = p_request_id;

  if v_status <> 'pending' then
    raise exception 'request is not pending';
  end if;

  v_days := public.leave_calendar_days_inclusive(v_start, v_end);
  v_yk := public.leave_calendar_year_key(v_org, v_start);

  if not p_approve then
    update public.leave_requests
    set
      status = 'rejected',
      decided_by = v_uid,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where id = p_request_id;
    return;
  end if;

  perform public.leave_ensure_allowance_row(v_org, v_requester, v_yk);

  if v_kind = 'annual' then
    select la.annual_entitlement_days into v_ent
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_used_other :=
      public.leave_sum_request_days(v_org, v_requester, 'annual', v_yk, array['pending', 'approved']::text[], p_request_id)
      + v_days;

    if v_used_other > coalesce(v_ent, 0) then
      raise exception 'annual leave would exceed entitlement';
    end if;
  else
    select la.toil_balance_days into v_bal
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_pending_toil := public.leave_pending_toil_days_excluding(v_org, v_requester, v_yk, p_request_id);
    if coalesce(v_bal, 0) - v_pending_toil < v_days then
      raise exception 'insufficient TOIL balance';
    end if;

    update public.leave_allowances
    set
      toil_balance_days = toil_balance_days - v_days,
      updated_at = now()
    where org_id = v_org and user_id = v_requester and leave_year = v_yk;
  end if;

  update public.leave_requests
  set
    status = 'approved',
    decided_by = v_uid,
    decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.leave_request_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_requester uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id, requester_id, status
  into v_org, v_requester, v_status
  from public.leave_requests
  where id = p_request_id;

  if v_requester is null then
    raise exception 'not found';
  end if;

  if v_requester <> v_uid then
    raise exception 'not allowed';
  end if;

  if v_status <> 'pending' then
    raise exception 'only pending requests can be cancelled';
  end if;

  update public.leave_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: allowances & org settings (leave.manage_org)
-- ---------------------------------------------------------------------------

create or replace function public.leave_allowance_upsert(
  p_target_user_id uuid,
  p_leave_year text,
  p_annual_entitlement_days numeric,
  p_toil_balance_days numeric
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
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_target_user_id and t.org_id = v_org
  ) then
    raise exception 'target not in org';
  end if;

  if p_leave_year is null or trim(p_leave_year) = '' then
    raise exception 'leave_year required';
  end if;

  insert into public.leave_allowances (
    org_id, user_id, leave_year, annual_entitlement_days, toil_balance_days
  )
  values (
    v_org,
    p_target_user_id,
    trim(p_leave_year),
    greatest(coalesce(p_annual_entitlement_days, 0), 0),
    greatest(coalesce(p_toil_balance_days, 0), 0)
  )
  on conflict (org_id, user_id, leave_year) do update
  set
    annual_entitlement_days = greatest(coalesce(excluded.annual_entitlement_days, 0), 0),
    toil_balance_days = greatest(coalesce(excluded.toil_balance_days, 0), 0),
    updated_at = now();
end;
$$;

create or replace function public.org_leave_settings_upsert(
  p_bradford_window_days integer,
  p_leave_year_start_month smallint,
  p_leave_year_start_day smallint
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
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  insert into public.org_leave_settings (
    org_id, bradford_window_days, leave_year_start_month, leave_year_start_day
  )
  values (
    v_org,
    coalesce(p_bradford_window_days, 365),
    coalesce(p_leave_year_start_month, 1),
    coalesce(p_leave_year_start_day, 1)
  )
  on conflict (org_id) do update
  set
    bradford_window_days = coalesce(excluded.bradford_window_days, public.org_leave_settings.bradford_window_days),
    leave_year_start_month = coalesce(excluded.leave_year_start_month, public.org_leave_settings.leave_year_start_month),
    leave_year_start_day = coalesce(excluded.leave_year_start_day, public.org_leave_settings.leave_year_start_day),
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: sickness + Bradford
-- ---------------------------------------------------------------------------

create or replace function public.sickness_absence_create(
  p_user_id uuid,
  p_start date,
  p_end date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_allowed boolean := false;
  sid uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org profile';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org
  ) then
    raise exception 'user not in org';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid dates';
  end if;

  if p_user_id = v_uid then
    v_allowed := public.has_permission(v_uid, v_org, 'leave.submit', '{}'::jsonb);
  elsif public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    v_allowed := true;
  elsif public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
    and exists (
      select 1 from public.profiles s where s.id = p_user_id and s.reports_to_user_id = v_uid
    ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'not allowed';
  end if;

  insert into public.sickness_absences (
    org_id, user_id, start_date, end_date, notes, created_by
  )
  values (
    v_org,
    p_user_id,
    p_start,
    p_end,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_uid
  )
  returning id into sid;

  return sid;
end;
$$;

create or replace function public.bradford_factor_for_user(p_user_id uuid, p_on date default (current_date))
returns table(spell_count integer, total_days numeric, bradford_score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  w_days int := 365;
  w_start date;
  w_end date;
  rec record;
  cur_start date;
  cur_end date;
  r_start date;
  r_end date;
  spells int := 0;
  dsum numeric := 0;
  first_sp boolean := true;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = p_user_id;
  if v_org is null then
    spell_count := 0;
    total_days := 0;
    bradford_score := 0;
    return next;
    return;
  end if;

  if v_org <> public.current_org_id() then
    raise exception 'not allowed';
  end if;

  if not (
    p_user_id = v_viewer
    or public.has_permission(v_viewer, v_org, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(v_viewer, v_org, 'leave.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1 from public.profiles s
        where s.id = p_user_id and s.reports_to_user_id = v_viewer
      )
    )
  ) then
    raise exception 'not allowed';
  end if;

  select coalesce(max(s.bradford_window_days), 365) into w_days
  from public.org_leave_settings s
  where s.org_id = v_org;

  w_end := p_on;
  w_start := p_on - (w_days - 1);

  for rec in
    select start_date, end_date
    from public.sickness_absences
    where org_id = v_org
      and user_id = p_user_id
      and start_date <= w_end
      and end_date >= w_start
    order by start_date, end_date
  loop
    r_start := greatest(rec.start_date, w_start);
    r_end := least(rec.end_date, w_end);
    if r_start > r_end then
      continue;
    end if;
    if first_sp then
      cur_start := r_start;
      cur_end := r_end;
      first_sp := false;
    elsif r_start <= cur_end + 1 then
      if r_end > cur_end then
        cur_end := r_end;
      end if;
    else
      spells := spells + 1;
      dsum := dsum + (cur_end - cur_start + 1);
      cur_start := r_start;
      cur_end := r_end;
    end if;
  end loop;

  if first_sp then
    spell_count := 0;
    total_days := 0;
    bradford_score := 0;
    return next;
    return;
  end if;

  spells := spells + 1;
  dsum := dsum + (cur_end - cur_start + 1);

  spell_count := spells;
  total_days := dsum;
  bradford_score := (spells::numeric * spells::numeric) * dsum;
  return next;
end;
$$;

comment on function public.bradford_factor_for_user is
  'Bradford score = S² × D over sickness_absences in [p_on - window + 1, p_on]; overlapping or contiguous episodes merge into one spell.';

create or replace function public.leave_pending_approval_count_for_me()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  n int;
begin
  if v_uid is null then
    return 0;
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    return 0;
  end if;

  if public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    select count(*)::int into n
    from public.leave_requests r
    where r.org_id = v_org and r.status = 'pending';
    return coalesce(n, 0);
  end if;

  if not public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb) then
    return 0;
  end if;

  select count(*)::int into n
  from public.leave_requests r
  join public.profiles s on s.id = r.requester_id
  where r.org_id = v_org
    and r.status = 'pending'
    and s.reports_to_user_id = v_uid;

  return coalesce(n, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.leave_calendar_days_inclusive(date, date) from public;
grant execute on function public.leave_calendar_days_inclusive(date, date) to authenticated;

revoke all on function public.leave_calendar_year_key(uuid, date) from public;
grant execute on function public.leave_calendar_year_key(uuid, date) to authenticated;

revoke all on function public.bradford_factor_for_user(uuid, date) from public;
grant execute on function public.bradford_factor_for_user(uuid, date) to authenticated;

revoke all on function public.leave_request_submit(text, date, date, text) from public;
grant execute on function public.leave_request_submit(text, date, date, text) to authenticated;

revoke all on function public.leave_request_decide(uuid, boolean, text) from public;
grant execute on function public.leave_request_decide(uuid, boolean, text) to authenticated;

revoke all on function public.leave_request_cancel(uuid) from public;
grant execute on function public.leave_request_cancel(uuid) to authenticated;

revoke all on function public.leave_allowance_upsert(uuid, text, numeric, numeric) from public;
grant execute on function public.leave_allowance_upsert(uuid, text, numeric, numeric) to authenticated;

revoke all on function public.org_leave_settings_upsert(integer, smallint, smallint) from public;
grant execute on function public.org_leave_settings_upsert(integer, smallint, smallint) to authenticated;

revoke all on function public.sickness_absence_create(uuid, date, date, text) from public;
grant execute on function public.sickness_absence_create(uuid, date, date, text) to authenticated;

revoke all on function public.leave_pending_approval_count_for_me() from public;
grant execute on function public.leave_pending_approval_count_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- Permission catalog + role grants
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('leave.submit', 'Submit leave', 'Submit annual leave, TOIL, and sickness records for self.', false),
  ('leave.view_own', 'View own leave', 'View own leave balances, requests, and Bradford.', false),
  ('leave.view_direct_reports', 'View team leave', 'View leave and sickness for direct reports.', false),
  ('leave.approve_direct_reports', 'Approve direct reports leave', 'Approve or reject leave for users who report to you.', false),
  ('leave.manage_org', 'Manage organisation leave', 'Set allowances, org leave settings, approve any request, full visibility.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'leave.submit'),
    ('org_admin', 'leave.view_own'),
    ('org_admin', 'leave.view_direct_reports'),
    ('org_admin', 'leave.approve_direct_reports'),
    ('org_admin', 'leave.manage_org'),
    ('manager', 'leave.submit'),
    ('manager', 'leave.view_own'),
    ('manager', 'leave.view_direct_reports'),
    ('manager', 'leave.approve_direct_reports'),
    ('coordinator', 'leave.submit'),
    ('coordinator', 'leave.view_own'),
    ('administrator', 'leave.submit'),
    ('administrator', 'leave.view_own'),
    ('duty_manager', 'leave.submit'),
    ('duty_manager', 'leave.view_own'),
    ('csa', 'leave.submit'),
    ('csa', 'leave.view_own'),
    ('society_leader', 'leave.submit'),
    ('society_leader', 'leave.view_own')
) as p(role_key, permission_key)
  on p.role_key = r.key
on conflict do nothing;
