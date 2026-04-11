-- Probation review check: completion timestamps, alerts, sync from probation performance reviews.

alter table public.employee_hr_records
  add column if not exists probation_check_completed_at timestamptz,
  add column if not exists probation_check_completed_by uuid references public.profiles (id) on delete set null;

comment on column public.employee_hr_records.probation_check_completed_at is
  'When the probation review / check-in was completed (manual or via completed probation-cycle review).';
comment on column public.employee_hr_records.probation_check_completed_by is
  'Profile who recorded completion (manager, HR, or reviewer when synced from performance review).';

create index if not exists employee_hr_records_probation_open_idx
  on public.employee_hr_records (org_id, probation_end_date)
  where probation_end_date is not null and probation_check_completed_at is null;

-- ---------------------------------------------------------------------------
-- Sync: completed probation-type performance review marks HR probation check
-- ---------------------------------------------------------------------------

create or replace function public.sync_probation_check_from_performance_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new;
  end if;

  if exists (
    select 1 from public.review_cycles c
    where c.id = new.cycle_id and c.type = 'probation'
  ) then
    update public.employee_hr_records r
    set probation_check_completed_at = coalesce(new.completed_at, now()),
        probation_check_completed_by = coalesce(auth.uid(), new.reviewer_id)
    where r.org_id = new.org_id
      and r.user_id = new.reviewee_id
      and r.probation_check_completed_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists performance_reviews_sync_probation_check_trg on public.performance_reviews;
create trigger performance_reviews_sync_probation_check_trg
  after insert or update on public.performance_reviews
  for each row execute procedure public.sync_probation_check_from_performance_review();

-- ---------------------------------------------------------------------------
-- Mark probation check complete (manager or HR); clear completion (HR only)
-- ---------------------------------------------------------------------------

create or replace function public.employee_probation_check_set(p_user_id uuid, p_clear boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_record_id uuid;
  v_old_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'not allowed';
  end if;

  if not exists (select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org) then
    raise exception 'employee not found';
  end if;

  select id, probation_check_completed_at into v_record_id, v_old_at
  from public.employee_hr_records
  where org_id = v_org and user_id = p_user_id;

  if v_record_id is null then
    raise exception 'no HR record';
  end if;

  if p_clear then
    if not public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
      raise exception 'not allowed';
    end if;
    update public.employee_hr_records set
      probation_check_completed_at = null,
      probation_check_completed_by = null,
      updated_by = v_uid
    where id = v_record_id;

    insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
    values (v_org, v_record_id, v_uid, 'probation_check_completed_at', v_old_at::text, null);
    return;
  end if;

  if public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
    null;
  elsif exists (
    select 1 from public.profiles t
    where t.id = p_user_id
      and t.org_id = v_org
      and t.reports_to_user_id = v_uid
  ) then
    null;
  else
    raise exception 'not allowed';
  end if;

  update public.employee_hr_records set
    probation_check_completed_at = now(),
    probation_check_completed_by = v_uid,
    updated_by = v_uid
  where id = v_record_id;

  insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
  values (v_org, v_record_id, v_uid, 'probation_check_completed_at', v_old_at::text, now()::text);
end;
$$;

revoke all on function public.employee_probation_check_set(uuid, boolean) from public;
grant execute on function public.employee_probation_check_set(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- In-app alerts for current user (employee + line manager for direct reports)
-- ---------------------------------------------------------------------------

create or replace function public.my_probation_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_today date := current_date;
  v_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.sort_dt), '[]'::jsonb)
  into v_items
  from (
    select
      jsonb_build_object(
        'role', case when p.id = v_uid then 'self' else 'manager' end,
        'user_id', p.id,
        'full_name', p.full_name,
        'preferred_name', p.preferred_name,
        'display_name',
          case
            when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name
            when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name
            else trim(p.preferred_name) || ' (' || p.full_name || ')'
          end,
        'probation_end_date', r.probation_end_date,
        'alert_level',
          case
            when v_today > r.probation_end_date + 7 then 'critical'
            when v_today > r.probation_end_date then 'overdue'
            else 'due_soon'
          end
      ) as obj,
      r.probation_end_date as sort_dt
    from public.employee_hr_records r
    join public.profiles p on p.id = r.user_id
    where r.org_id = v_org
      and p.status = 'active'
      and r.probation_end_date is not null
      and r.probation_check_completed_at is null
      and v_today >= r.probation_end_date - 30
      and (
        p.id = v_uid
        or p.reports_to_user_id = v_uid
      )
  ) x;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.my_probation_alerts() from public;
grant execute on function public.my_probation_alerts() to authenticated;

-- ---------------------------------------------------------------------------
-- hr_employee_file: expose probation check fields
-- ---------------------------------------------------------------------------

drop function if exists public.hr_employee_file(uuid);
create or replace function public.hr_employee_file(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  avatar_url text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  hr_record_id uuid,
  job_title text,
  grade_level text,
  contract_type text,
  salary_band text,
  fte numeric,
  work_location text,
  employment_start_date date,
  probation_end_date date,
  notice_period_weeks integer,
  hired_from_application_id uuid,
  notes text,
  record_created_at timestamptz,
  record_updated_at timestamptz,
  position_type text,
  pay_grade text,
  employment_basis text,
  weekly_hours numeric,
  positions_count integer,
  budget_amount numeric,
  budget_currency text,
  department_start_date date,
  continuous_employment_start_date date,
  custom_fields jsonb,
  length_of_service_years integer,
  length_of_service_months integer,
  contract_start_date date,
  contract_end_date date,
  contract_signed_on date,
  contract_document_url text,
  contract_review_date date,
  home_address_line1 text,
  home_address_line2 text,
  home_city text,
  home_county text,
  home_postcode text,
  home_country text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_contact_email text,
  rtw_status text,
  rtw_checked_on date,
  rtw_expiry_date date,
  rtw_check_method text,
  rtw_document_url text,
  visa_type text,
  probation_check_completed_at timestamptz,
  probation_check_completed_by uuid
)
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

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  if public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    null;
  elsif public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1 from public.profiles t
       where t.id = p_user_id
         and t.reports_to_user_id = v_uid
         and t.org_id = v_org
    )
  then
    null;
  elsif p_user_id = v_uid
    and public.has_permission(v_uid, v_org, 'hr.view_own', '{}'::jsonb)
  then
    null;
  else
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org
  ) then
    raise exception 'employee not found';
  end if;

  return query
  select
    p.id                         as user_id,
    p.full_name::text,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    p.reports_to_user_id,
    m.full_name::text            as reports_to_name,
    coalesce(array_agg(d.name order by d.name) filter (where d.name is not null), '{}'::text[]) as department_names,
    r.id                         as hr_record_id,
    r.job_title::text,
    r.grade_level::text,
    r.contract_type::text,
    r.salary_band::text,
    r.fte,
    r.work_location::text,
    r.employment_start_date,
    r.probation_end_date,
    r.notice_period_weeks,
    r.hired_from_application_id,
    r.notes::text,
    r.created_at                 as record_created_at,
    r.updated_at                 as record_updated_at,
    r.position_type::text,
    r.pay_grade::text,
    r.employment_basis::text,
    r.weekly_hours,
    r.positions_count,
    r.budget_amount,
    r.budget_currency::text,
    r.department_start_date,
    r.continuous_employment_start_date,
    r.custom_fields,
    case when r.employment_start_date is not null then extract(year from age(current_date, r.employment_start_date))::integer else null end as length_of_service_years,
    case when r.employment_start_date is not null then extract(month from age(current_date, r.employment_start_date))::integer else null end as length_of_service_months,
    r.contract_start_date,
    r.contract_end_date,
    r.contract_signed_on,
    r.contract_document_url::text,
    r.contract_review_date,
    r.home_address_line1::text,
    r.home_address_line2::text,
    r.home_city::text,
    r.home_county::text,
    r.home_postcode::text,
    r.home_country::text,
    r.emergency_contact_name::text,
    r.emergency_contact_relationship::text,
    r.emergency_contact_phone::text,
    r.emergency_contact_email::text,
    r.rtw_status::text,
    r.rtw_checked_on,
    r.rtw_expiry_date,
    r.rtw_check_method::text,
    r.rtw_document_url::text,
    r.visa_type::text,
    r.probation_check_completed_at,
    r.probation_check_completed_by
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.id = p_user_id
    and p.org_id = v_org
  group by
    p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.hired_from_application_id, r.notes,
    r.created_at, r.updated_at, r.position_type, r.pay_grade, r.employment_basis,
    r.weekly_hours, r.positions_count, r.budget_amount, r.budget_currency,
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields,
    r.contract_start_date, r.contract_end_date, r.contract_signed_on, r.contract_document_url, r.contract_review_date,
    r.home_address_line1, r.home_address_line2, r.home_city, r.home_county, r.home_postcode, r.home_country,
    r.emergency_contact_name, r.emergency_contact_relationship, r.emergency_contact_phone, r.emergency_contact_email,
    r.rtw_status, r.rtw_checked_on, r.rtw_expiry_date, r.rtw_check_method, r.rtw_document_url, r.visa_type,
    r.probation_check_completed_at, r.probation_check_completed_by;
end;
$$;

-- ---------------------------------------------------------------------------
-- HR dashboard: probation list = pending checks in prompt window or overdue
-- ---------------------------------------------------------------------------

create or replace function public.hr_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_today date := current_date;
  v_result jsonb;
  v_s record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into v_s from public.org_one_on_one_settings where org_id = v_org;
  if v_s is null then
    insert into public.org_one_on_one_settings (org_id) values (v_org) on conflict do nothing;
    select * into v_s from public.org_one_on_one_settings where org_id = v_org;
  end if;

  select jsonb_build_object(
    'headcount_total',
      (select count(*) from public.profiles where org_id = v_org and status = 'active'),

    'by_contract',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object('contract_type', contract_type, 'count', count(*)) as row
           from public.employee_hr_records
           where org_id = v_org
           group by contract_type
           order by count(*) desc
         ) s),
        '[]'::jsonb
      ),

    'by_location',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object('work_location', work_location, 'count', count(*)) as row
           from public.employee_hr_records
           where org_id = v_org
           group by work_location
           order by count(*) desc
         ) s),
        '[]'::jsonb
      ),

    'missing_hr_records',
      (select count(*)
       from public.profiles p
       where p.org_id = v_org
         and p.status = 'active'
         and not exists (
           select 1 from public.employee_hr_records r where r.user_id = p.id and r.org_id = v_org
         )
      ),

    'onboarding_active',
      (select count(*) from public.onboarding_runs where org_id = v_org and status = 'active'),

    'probation_ending_soon',
      coalesce(
        (select jsonb_agg(q.row order by q.sort_dt)
         from (
           select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'preferred_name', p.preferred_name,
             'display_name',
               case
                 when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name
                 when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name
                 else trim(p.preferred_name) || ' (' || p.full_name || ')'
               end,
             'probation_end_date', r.probation_end_date,
             'reports_to_user_id', p.reports_to_user_id,
             'alert_level',
               case
                 when v_today > r.probation_end_date + 7 then 'critical'
                 when v_today > r.probation_end_date then 'overdue'
                 else 'due_soon'
               end
           ) as row,
           r.probation_end_date as sort_dt
           from public.employee_hr_records r
           join public.profiles p on p.id = r.user_id
           where r.org_id = v_org
             and p.status = 'active'
             and r.probation_end_date is not null
             and r.probation_check_completed_at is null
             and v_today >= r.probation_end_date - 30
           order by r.probation_end_date
         ) q
        ),
        '[]'::jsonb
      ),

    'review_cycles_active',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'id', c.id,
             'name', c.name,
             'type', c.type,
             'total', count(pr.id),
             'completed', count(pr.id) filter (where pr.status = 'completed'),
             'manager_due', c.manager_assessment_due
           ) as row
           from public.review_cycles c
           left join public.performance_reviews pr on pr.cycle_id = c.id
           where c.org_id = v_org and c.status = 'active'
           group by c.id, c.name, c.type, c.manager_assessment_due
           order by c.created_at desc
         ) s),
        '[]'::jsonb
      ),

    'on_leave_today',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', lr.requester_id,
             'full_name', p.full_name,
             'kind', lr.kind,
             'end_date', lr.end_date
           ) as row
           from public.leave_requests lr
           join public.profiles p on p.id = lr.requester_id
           where lr.org_id = v_org
             and lr.status = 'approved'
             and lr.start_date <= v_today
             and lr.end_date >= v_today
           order by p.full_name
         ) s),
        '[]'::jsonb
      ),

    'bradford_alerts',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'spell_count', bf.spell_count,
             'total_days', bf.total_days,
             'bradford_score', bf.bradford_score
           ) as row
           from public.profiles p
           cross join lateral (
             select
               coalesce(bf_data.spell_count, 0) as spell_count,
               coalesce(bf_data.total_days, 0) as total_days,
               coalesce(bf_data.bradford_score, 0) as bradford_score
             from (
               select
                 count(spell) as spell_count,
                 sum(days) as total_days,
                 (count(spell) * count(spell) * sum(days))::int as bradford_score
               from (
                 select
                   min(sa.start_date) as spell,
                   sum(
                     (least(sa.end_date, v_today) - greatest(sa.start_date, v_today - (
                       select coalesce(bradford_window_days, 365)
                       from public.org_leave_settings ols where ols.org_id = v_org
                     )))::int + 1
                   ) as days
                 from public.sickness_absences sa
                 where sa.user_id = p.id
                   and sa.org_id = v_org
                   and sa.start_date >= (v_today - (
                     select coalesce(bradford_window_days, 365)
                       from public.org_leave_settings ols where ols.org_id = v_org
                   ))
                 group by
                   (select count(*) from public.sickness_absences sa2
                    where sa2.user_id = p.id and sa2.org_id = v_org
                      and sa2.end_date < sa.start_date
                      and sa2.end_date >= sa.start_date - 1)
               ) spell_data
             ) bf_data
           ) bf
           where p.org_id = v_org
             and p.status = 'active'
             and bf.bradford_score >= 200
           order by bf.bradford_score desc
           limit 10
         ) s),
        '[]'::jsonb
      ),

    'one_on_one_pairs_overdue',
      (select count(*)::integer
       from (
         select 1
         from public.profiles p
         join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = v_org
         cross join lateral (
           select public._one_on_one_effective_cadence_days(v_org, mgr.id, p.id) as cadence_days
         ) cad
         left join lateral (
           select max(m.completed_at)::date as last_completed_at
           from public.one_on_one_meetings m
           where m.org_id = v_org
             and m.manager_user_id = mgr.id
             and m.report_user_id = p.id
             and m.status = 'completed'
         ) lm on true
         where p.org_id = v_org
           and p.status = 'active'
           and p.reports_to_user_id is not null
           and v_today > (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date
       ) t
      ),

    'one_on_one_pairs_due_soon',
      (select count(*)::integer
       from (
         select 1
         from public.profiles p
         join public.profiles mgr on mgr.id = p.reports_to_user_id and mgr.org_id = v_org
         cross join lateral (
           select public._one_on_one_effective_cadence_days(v_org, mgr.id, p.id) as cadence_days
         ) cad
         left join lateral (
           select max(m.completed_at)::date as last_completed_at
           from public.one_on_one_meetings m
           where m.org_id = v_org
             and m.manager_user_id = mgr.id
             and m.report_user_id = p.id
             and m.status = 'completed'
         ) lm on true
         where p.org_id = v_org
           and p.status = 'active'
           and p.reports_to_user_id is not null
           and (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date <= v_today + v_s.due_soon_days
           and v_today <= (
             coalesce(lm.last_completed_at, p.created_at::date)
             + (cad.cadence_days * interval '1 day')
           )::date
           and not (
             v_today > (
               coalesce(lm.last_completed_at, p.created_at::date)
               + (cad.cadence_days * interval '1 day')
             )::date
           )
       ) t2
      )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.hr_dashboard_stats() from public;
grant execute on function public.hr_dashboard_stats() to authenticated;

grant execute on function public.hr_employee_file(uuid) to authenticated;
