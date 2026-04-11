-- Shared Bradford S²×D computation (rolling window from org_leave_settings).
-- Used by bradford_factor_for_user and hr_bradford_report; not exposed to clients.

create or replace function public._bradford_factor_raw(
  p_org_id uuid,
  p_user_id uuid,
  p_on date
)
returns table(spell_count integer, total_days numeric, bradford_score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
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
  select coalesce(max(s.bradford_window_days), 365) into w_days
  from public.org_leave_settings s
  where s.org_id = p_org_id;

  w_end := p_on;
  w_start := p_on - (w_days - 1);

  for rec in
    select start_date, end_date
    from public.sickness_absences
    where org_id = p_org_id
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

revoke all on function public._bradford_factor_raw(uuid, uuid, date) from public;
revoke all on function public._bradford_factor_raw(uuid, uuid, date) from anon, authenticated;

comment on function public._bradford_factor_raw is
  'Internal: Bradford S²×D for one user in an org (no auth).';

-- Single-user Bradford: align permissions with hr_employee_file (HR can view any employee in org).

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
    or public.has_permission(v_viewer, v_org, 'hr.view_records', '{}'::jsonb)
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

  return query
  select r.spell_count, r.total_days, r.bradford_score
  from public._bradford_factor_raw(v_org, p_user_id, p_on) r;
end;
$$;

comment on function public.bradford_factor_for_user is
  'Bradford score = S² × D over sickness_absences in [p_on - window + 1, p_on]; overlapping or contiguous episodes merge into one spell.';

-- Org-wide / team report (same roster rules as hr_directory_list).

create or replace function public.hr_bradford_report(p_on date default (current_date))
returns table(
  user_id uuid,
  full_name text,
  preferred_name text,
  reports_to_user_id uuid,
  reports_to_name text,
  spell_count integer,
  total_days numeric,
  bradford_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_full_access boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
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
  select
    p.id as user_id,
    p.full_name::text,
    p.preferred_name::text,
    p.reports_to_user_id,
    m.full_name::text as reports_to_name,
    bf.spell_count,
    bf.total_days,
    bf.bradford_score
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  cross join lateral public._bradford_factor_raw(v_org, p.id, p_on) bf
  where p.org_id = v_org
    and p.status = 'active'
    and (
      v_full_access
      or p.reports_to_user_id = v_uid
    )
  order by bf.bradford_score desc nulls last, p.full_name asc;
end;
$$;

comment on function public.hr_bradford_report is
  'Bradford S²×D for active employees: full org if hr.view_records or leave.manage_org; else direct reports only (hr.view_direct_reports).';

revoke all on function public.hr_bradford_report(date) from public;
grant execute on function public.hr_bradford_report(date) to authenticated;
