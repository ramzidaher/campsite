-- Helpers + RPCs for attendance, timesheets, wagesheets, work sites, sickness void, HR upsert.

-- ---------------------------------------------------------------------------
-- Geo + week helpers
-- ---------------------------------------------------------------------------

create or replace function public._geo_distance_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
returns numeric
language sql
immutable
as $$
  select (
    6371000.0 * acos(
      least(
        1::double precision,
        cos(radians(lat1::double precision)) * cos(radians(lat2::double precision))
        * cos(radians(lng2::double precision) - radians(lng1::double precision))
        + sin(radians(lat1::double precision)) * sin(radians(lat2::double precision))
      )
    )
  )::numeric;
$$;

create or replace function public.attendance_week_bounds(p_d date)
returns table (week_start date, week_end date)
language sql
immutable
as $$
  select
    (p_d - (extract(isodow from p_d)::int - 1))::date as week_start,
    (p_d - (extract(isodow from p_d)::int - 1) + 6)::date as week_end;
$$;

create or replace function public.attendance_week_total_minutes(
  p_org_id uuid,
  p_user_id uuid,
  p_week_start date,
  p_week_end date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rec record;
  state text := 'out';
  t0 timestamptz;
  total int := 0;
  delta numeric;
begin
  for rec in
    select clocked_at, direction
    from public.attendance_events
    where org_id = p_org_id
      and user_id = p_user_id
      and (clocked_at at time zone 'UTC')::date between p_week_start and p_week_end
    order by clocked_at
  loop
    if rec.direction = 'in' then
      state := 'in';
      t0 := rec.clocked_at;
    else
      if state = 'in' and t0 is not null then
        delta := extract(epoch from (rec.clocked_at - t0)) / 60.0;
        if delta > 0 then
          total := total + floor(delta)::int;
        end if;
      end if;
      state := 'out';
      t0 := null;
    end if;
  end loop;
  return total;
end;
$$;

revoke all on function public.attendance_week_total_minutes(uuid, uuid, date, date) from public;
grant execute on function public.attendance_week_total_minutes(uuid, uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Org attendance settings row
-- ---------------------------------------------------------------------------

create or replace function public.org_attendance_settings_ensure(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_attendance_settings (org_id)
  values (p_org_id)
  on conflict (org_id) do nothing;
end;
$$;

revoke all on function public.org_attendance_settings_ensure(uuid) from public;
grant execute on function public.org_attendance_settings_ensure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clock in / out
-- ---------------------------------------------------------------------------

create or replace function public.attendance_clock_event(
  p_direction text,
  p_source text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_accuracy_m numeric default null,
  p_target_user_id uuid default null,
  p_manager_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_target uuid;
  v_hr public.employee_hr_records;
  v_settings public.org_attendance_settings;
  v_site record;
  v_best_site uuid;
  v_best_dist numeric;
  v_dist numeric;
  v_within boolean;
  v_strict boolean;
  v_clock timestamptz := now();
  eid uuid;
  ws date;
  we date;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'invalid direction';
  end if;

  if p_source not in ('self_web', 'self_mobile', 'manager_proxy') then
    raise exception 'invalid source';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  v_target := coalesce(p_target_user_id, v_uid);

  if not exists (select 1 from public.profiles t where t.id = v_target and t.org_id = v_org) then
    raise exception 'target not in org';
  end if;

  select * into v_hr from public.employee_hr_records
  where org_id = v_org and user_id = v_target;

  if v_hr.id is null or coalesce(v_hr.timesheet_clock_enabled, false) = false then
    raise exception 'clock not enabled for this employee';
  end if;

  if v_target <> v_uid then
    if not (
      public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (select 1 from public.profiles s where s.id = v_target and s.reports_to_user_id = v_uid)
      )
    ) then
      raise exception 'not allowed to clock for this user';
    end if;
    if p_source <> 'manager_proxy' then
      raise exception 'proxy must use manager_proxy source';
    end if;
    if nullif(trim(coalesce(p_manager_reason, '')), '') is null then
      raise exception 'manager_reason required for proxy clock';
    end if;
  else
    if p_source = 'manager_proxy' then
      raise exception 'invalid source for self clock';
    end if;
  end if;

  perform public.org_attendance_settings_ensure(v_org);
  select * into v_settings from public.org_attendance_settings where org_id = v_org;

  v_strict := coalesce(v_settings.geo_strict, true);
  v_within := null;
  v_best_site := null;

  if v_strict and p_lat is not null and p_lng is not null then
    v_best_dist := null;
    for v_site in
      select id, lat, lng, coalesce(radius_m, v_settings.default_site_radius_m) as rad
      from public.work_sites
      where org_id = v_org and active = true
    loop
      v_dist := public._geo_distance_m(p_lat, p_lng, v_site.lat, v_site.lng);
      if v_dist <= v_site.rad then
        v_within := true;
        v_best_site := v_site.id;
        exit;
      end if;
      if v_best_dist is null or v_dist < v_best_dist then
        v_best_dist := v_dist;
      end if;
    end loop;
    if v_within is distinct from true then
      if exists (select 1 from public.work_sites where org_id = v_org and active = true) then
        raise exception 'location outside allowed work sites';
      end if;
    end if;
  end if;

  insert into public.attendance_events (
    org_id, user_id, work_site_id, clocked_at, direction, source,
    lat, lng, accuracy_m, within_site, manager_reason, created_by
  )
  values (
    v_org, v_target, v_best_site, v_clock, p_direction, p_source,
    p_lat, p_lng, p_accuracy_m, v_within, nullif(trim(coalesce(p_manager_reason, '')), ''), v_uid
  )
  returning id into eid;

  select week_start, week_end into ws, we from public.attendance_week_bounds((v_clock at time zone 'UTC')::date);

  insert into public.weekly_timesheets (
    org_id, user_id, week_start_date, week_end_date, status, reported_total_minutes
  )
  values (
    v_org, v_target, ws, we, 'draft',
    public.attendance_week_total_minutes(v_org, v_target, ws, we)
  )
  on conflict (org_id, user_id, week_start_date) do update
    set reported_total_minutes = case weekly_timesheets.status
        when 'draft' then public.attendance_week_total_minutes(v_org, v_target, ws, we)
        else weekly_timesheets.reported_total_minutes
      end,
      updated_at = now();

  return eid;
end;
$$;

revoke all on function public.attendance_clock_event(text, text, numeric, numeric, numeric, uuid, text) from public;
grant execute on function public.attendance_clock_event(text, text, numeric, numeric, numeric, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Weekly timesheet submit + manager decision + wagesheet
-- ---------------------------------------------------------------------------

create or replace function public.weekly_timesheet_submit(p_week_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  we date;
  mins int;
  tid uuid;
  vst text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  select week_end into we from public.attendance_week_bounds(p_week_start);

  if not exists (
    select 1 from public.employee_hr_records e
    where e.org_id = v_org and e.user_id = v_uid and e.timesheet_clock_enabled = true
  ) then
    raise exception 'clock not enabled';
  end if;

  mins := public.attendance_week_total_minutes(v_org, v_uid, p_week_start, we);

  select id, status into tid, vst
  from public.weekly_timesheets
  where org_id = v_org and user_id = v_uid and week_start_date = p_week_start
  for update;

  if tid is null then
    insert into public.weekly_timesheets (
      org_id, user_id, week_start_date, week_end_date, status,
      reported_total_minutes, submitted_at, submitted_by
    )
    values (
      v_org, v_uid, p_week_start, we, 'submitted',
      mins, now(), v_uid
    );
  elsif vst in ('draft', 'submitted', 'rejected') then
    update public.weekly_timesheets
    set status = 'submitted',
        reported_total_minutes = mins,
        submitted_at = now(),
        submitted_by = v_uid,
        updated_at = now()
    where id = tid;
  else
    raise exception 'timesheet not submittable';
  end if;
end;
$$;

revoke all on function public.weekly_timesheet_submit(date) from public;
grant execute on function public.weekly_timesheet_submit(date) to authenticated;

create or replace function public.weekly_timesheet_manager_decide(
  p_user_id uuid,
  p_week_start date,
  p_decision text,
  p_approved_minutes integer default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  we date;
  tid uuid;
  st text;
  rep int;
  appr int;
  v_hr public.employee_hr_records;
  v_rate numeric;
  v_hours numeric;
  v_gross numeric;
  v_ssp jsonb;
  v_ssp_amt numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  if not (
    public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
      and exists (select 1 from public.profiles s where s.id = p_user_id and s.reports_to_user_id = v_uid)
    )
  ) then
    raise exception 'not allowed';
  end if;

  select week_end into we from public.attendance_week_bounds(p_week_start);

  select id, status, reported_total_minutes into tid, st, rep
  from public.weekly_timesheets
  where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;

  if tid is null then
    raise exception 'timesheet not found';
  end if;

  if st <> 'submitted' then
    raise exception 'timesheet must be submitted';
  end if;

  if p_decision = 'reject' then
    update public.weekly_timesheets
    set status = 'rejected',
        decided_at = now(),
        decided_by = v_uid,
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = tid;
    return;
  end if;

  appr := coalesce(p_approved_minutes, rep);
  if appr is null or appr < 0 then
    raise exception 'invalid approved minutes';
  end if;

  update public.weekly_timesheets
  set status = 'approved',
      approved_total_minutes = appr,
      decided_at = now(),
      decided_by = v_uid,
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = tid;

  select * into v_hr from public.employee_hr_records
  where org_id = v_org and user_id = p_user_id;

  v_rate := v_hr.hourly_pay_gbp;
  v_hours := round((appr::numeric / 60.0)::numeric, 4);
  v_gross := case
    when v_rate is not null then round(v_hours * v_rate, 2)
    else 0
  end;

  delete from public.wagesheet_lines
  where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;

  insert into public.wagesheet_lines (
    org_id, user_id, week_start_date, line_type, description, hours, hourly_rate_gbp, amount_gbp, meta
  )
  values (
    v_org, p_user_id, p_week_start, 'basic_pay', 'Approved hours × hourly rate',
    v_hours, v_rate, coalesce(v_gross, 0),
    jsonb_build_object('approved_minutes', appr, 'reported_minutes', rep)
  );

  v_ssp := public.ssp_calculation_summary(p_user_id, p_week_start, we);

  v_ssp_amt := coalesce((v_ssp->>'total_ssp_gbp')::numeric, 0);
  if v_ssp_amt > 0 then
    insert into public.wagesheet_lines (
      org_id, user_id, week_start_date, line_type, description, hours, hourly_rate_gbp, amount_gbp, meta
    )
    values (
      v_org, p_user_id, p_week_start, 'ssp', 'Statutory Sick Pay (estimate)', null, null, v_ssp_amt,
      coalesce(v_ssp, '{}'::jsonb)
    );
  end if;
end;
$$;

revoke all on function public.weekly_timesheet_manager_decide(uuid, date, text, integer, text) from public;
grant execute on function public.weekly_timesheet_manager_decide(uuid, date, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Work sites (HR managers)
-- ---------------------------------------------------------------------------

create or replace function public.work_site_upsert(
  p_id uuid,
  p_name text,
  p_lat numeric,
  p_lng numeric,
  p_radius_m numeric,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  sid uuid;
  v_rad numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  perform public.org_attendance_settings_ensure(v_org);

  if p_lat is null or p_lng is null then
    raise exception 'lat/lng required';
  end if;

  if p_radius_m is not null and p_radius_m <= 0 then
    raise exception 'invalid radius';
  end if;

  select default_site_radius_m into v_rad from public.org_attendance_settings where org_id = v_org;
  v_rad := coalesce(v_rad, 100);

  if p_id is null then
    insert into public.work_sites (org_id, name, lat, lng, radius_m, active)
    values (
      v_org,
      coalesce(trim(p_name), ''),
      p_lat,
      p_lng,
      coalesce(p_radius_m, v_rad),
      coalesce(p_active, true)
    )
    returning id into sid;
  else
    update public.work_sites
    set
      name = coalesce(trim(p_name), ''),
      lat = p_lat,
      lng = p_lng,
      radius_m = coalesce(p_radius_m, radius_m),
      active = coalesce(p_active, active)
    where id = p_id and org_id = v_org
    returning id into sid;
    if sid is null then
      raise exception 'site not found';
    end if;
  end if;

  return sid;
end;
$$;

revoke all on function public.work_site_upsert(uuid, text, numeric, numeric, numeric, boolean) from public;
grant execute on function public.work_site_upsert(uuid, text, numeric, numeric, numeric, boolean) to authenticated;

create or replace function public.org_attendance_settings_update(
  p_geo_strict boolean,
  p_default_site_radius_m numeric,
  p_reject_allows_employee_resubmit boolean,
  p_reject_allows_manager_correction boolean
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  perform public.org_attendance_settings_ensure(v_org);

  update public.org_attendance_settings
  set
    geo_strict = coalesce(p_geo_strict, geo_strict),
    default_site_radius_m = coalesce(p_default_site_radius_m, default_site_radius_m),
    reject_allows_employee_resubmit = coalesce(p_reject_allows_employee_resubmit, reject_allows_employee_resubmit),
    reject_allows_manager_correction = coalesce(p_reject_allows_manager_correction, reject_allows_manager_correction),
    updated_at = now()
  where org_id = v_org;
end;
$$;

revoke all on function public.org_attendance_settings_update(boolean, numeric, boolean, boolean) from public;
grant execute on function public.org_attendance_settings_update(boolean, numeric, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Sickness void
-- ---------------------------------------------------------------------------

create or replace function public.sickness_absence_void(
  p_absence_id uuid,
  p_reason_code text,
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
  v_user uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select sa.org_id, sa.user_id into v_org, v_user
  from public.sickness_absences sa
  where sa.id = p_absence_id;

  if v_org is null then
    raise exception 'not found';
  end if;

  if v_org <> (select org_id from public.profiles where id = v_uid and status = 'active') then
    raise exception 'not allowed';
  end if;

  if not (
    public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
      and exists (select 1 from public.profiles s where s.id = v_user and s.reports_to_user_id = v_uid)
    )
  ) then
    raise exception 'not allowed';
  end if;

  if nullif(trim(coalesce(p_reason_code, '')), '') is null then
    raise exception 'reason_code required';
  end if;

  update public.sickness_absences
  set
    voided_at = now(),
    void_reason_code = trim(p_reason_code),
    void_notes = nullif(trim(coalesce(p_notes, '')), ''),
    voided_by = v_uid
  where id = p_absence_id and voided_at is null;
end;
$$;

revoke all on function public.sickness_absence_void(uuid, text, text) from public;
grant execute on function public.sickness_absence_void(uuid, text, text) to authenticated;
