-- HR dashboard stats: single RPC for all summary metrics shown on /admin/hr.

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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    -- headcount
    'headcount_total',
      (select count(*) from public.profiles where org_id = v_org and status = 'active'),

    -- by contract type (only those with HR records)
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

    -- by work location
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

    -- missing HR records
    'missing_hr_records',
      (select count(*)
       from public.profiles p
       where p.org_id = v_org
         and p.status = 'active'
         and not exists (
           select 1 from public.employee_hr_records r where r.user_id = p.id and r.org_id = v_org
         )
      ),

    -- active onboarding runs
    'onboarding_active',
      (select count(*) from public.onboarding_runs where org_id = v_org and status = 'active'),

    -- probation ending in next 60 days
    'probation_ending_soon',
      coalesce(
        (select jsonb_agg(row)
         from (
           select jsonb_build_object(
             'user_id', p.id,
             'full_name', p.full_name,
             'probation_end_date', r.probation_end_date
           ) as row
           from public.employee_hr_records r
           join public.profiles p on p.id = r.user_id
           where r.org_id = v_org
             and r.probation_end_date is not null
             and r.probation_end_date >= v_today
             and r.probation_end_date <= v_today + 60
           order by r.probation_end_date
         ) s),
        '[]'::jsonb
      ),

    -- active review cycles with progress
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

    -- on leave today (approved annual/TOIL)
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

    -- high bradford scores (threshold 200 — common UK HR trigger)
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
                   -- group into spells: episodes within 1 day of each other merge
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
      )
  ) into v_result;

  return v_result;
end;
$$;
