-- Leave reporting / analytics: usage trends + high-absence trigger list.

create or replace function public.hr_leave_usage_trends(p_on date default current_date)
returns table(
  month_key text,
  leave_days numeric,
  sickness_days numeric,
  leave_request_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_full_access boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = v_uid and p.status = 'active';
  if v_org is null then
    raise exception 'not authenticated';
  end if;

  v_full_access :=
    public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb);

  if not v_full_access and not public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', p_on) - interval '5 months',
      date_trunc('month', p_on),
      interval '1 month'
    )::date as month_start
  ),
  scoped_people as (
    select pr.id
    from public.profiles pr
    where pr.org_id = v_org
      and pr.status = 'active'
      and (
        v_full_access
        or pr.reports_to_user_id = v_uid
      )
  ),
  leave_monthly as (
    select
      date_trunc('month', lr.start_date)::date as month_start,
      coalesce(sum(public.leave_request_duration_days(v_org, lr.start_date, lr.end_date, lr.half_day_portion)), 0)::numeric as leave_days,
      count(*)::int as leave_request_count
    from public.leave_requests lr
    where lr.org_id = v_org
      and lr.requester_id in (select id from scoped_people)
      and lr.status in ('approved', 'pending', 'pending_edit', 'pending_cancel')
      and lr.start_date >= (date_trunc('month', p_on) - interval '5 months')::date
      and lr.start_date < (date_trunc('month', p_on) + interval '1 month')::date
    group by 1
  ),
  sickness_monthly as (
    select
      date_trunc('month', sa.start_date)::date as month_start,
      coalesce(sum((least(sa.end_date, p_on) - sa.start_date + 1)), 0)::numeric as sickness_days
    from public.sickness_absences sa
    where sa.org_id = v_org
      and sa.user_id in (select id from scoped_people)
      and sa.start_date >= (date_trunc('month', p_on) - interval '5 months')::date
      and sa.start_date < (date_trunc('month', p_on) + interval '1 month')::date
      and sa.voided_at is null
    group by 1
  )
  select
    to_char(m.month_start, 'YYYY-MM')::text as month_key,
    coalesce(lm.leave_days, 0)::numeric as leave_days,
    coalesce(sm.sickness_days, 0)::numeric as sickness_days,
    coalesce(lm.leave_request_count, 0)::int as leave_request_count
  from months m
  left join leave_monthly lm on lm.month_start = m.month_start
  left join sickness_monthly sm on sm.month_start = m.month_start
  order by m.month_start asc;
end;
$$;

revoke all on function public.hr_leave_usage_trends(date) from public;
grant execute on function public.hr_leave_usage_trends(date) to authenticated;

create or replace function public.hr_high_absence_triggers(p_on date default current_date)
returns table(
  user_id uuid,
  full_name text,
  preferred_name text,
  reports_to_name text,
  spell_count integer,
  total_days numeric,
  bradford_score numeric,
  trigger_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_full_access boolean := false;
  v_threshold numeric := 200;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = v_uid and p.status = 'active';
  if v_org is null then
    raise exception 'not authenticated';
  end if;

  v_full_access :=
    public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb);

  if not v_full_access and not public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select coalesce(hmas.bradford_alert_threshold, 200)
  into v_threshold
  from public.hr_metric_alert_settings hmas
  where hmas.org_id = v_org;

  return query
  select
    p.id as user_id,
    p.full_name::text,
    p.preferred_name::text,
    mgr.full_name::text as reports_to_name,
    bf.spell_count,
    bf.total_days,
    bf.bradford_score,
    case
      when bf.bradford_score >= v_threshold and bf.total_days >= 10 then 'High Bradford and high total absence days'
      when bf.bradford_score >= v_threshold then 'Bradford score above threshold'
      when bf.total_days >= 15 then 'High total absence days'
      when bf.spell_count >= 6 then 'High spell frequency'
      else 'Review triggered'
    end::text as trigger_reason
  from public.profiles p
  left join public.profiles mgr on mgr.id = p.reports_to_user_id
  cross join lateral public._bradford_factor_raw(v_org, p.id, p_on) bf
  where p.org_id = v_org
    and p.status = 'active'
    and (
      v_full_access
      or p.reports_to_user_id = v_uid
    )
    and (
      bf.bradford_score >= v_threshold
      or bf.total_days >= 15
      or bf.spell_count >= 6
    )
  order by bf.bradford_score desc, bf.total_days desc, p.full_name asc;
end;
$$;

revoke all on function public.hr_high_absence_triggers(date) from public;
grant execute on function public.hr_high_absence_triggers(date) to authenticated;
