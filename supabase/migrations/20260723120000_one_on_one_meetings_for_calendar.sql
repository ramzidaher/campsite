-- Scheduled / in-progress 1:1 meetings on the org calendar for both participants (manager + report)
-- and for HR (all meetings in range). Does not require one_on_one.view_own so the calendar works for
-- every role that can be a direct report.

create or replace function public.one_on_one_meetings_for_calendar(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  if p_to <= p_from then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (select jsonb_agg(x.obj order by x.sort_key asc)
     from (
       select
         jsonb_build_object(
           'id', m.id,
           'manager_user_id', m.manager_user_id,
           'report_user_id', m.report_user_id,
           'manager_name', pm.full_name,
           'report_name', pr.full_name,
           'starts_at', m.starts_at,
           'ends_at', m.ends_at,
           'status', m.status
         ) as obj,
         m.starts_at as sort_key
       from public.one_on_one_meetings m
       join public.profiles pm on pm.id = m.manager_user_id
       join public.profiles pr on pr.id = m.report_user_id
       where m.org_id = v_org
         and m.starts_at >= p_from
         and m.starts_at < p_to
         and m.status in ('scheduled', 'in_progress')
         and (
           v_hr
           or m.manager_user_id = v_uid
           or m.report_user_id = v_uid
         )
     ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_meetings_for_calendar(timestamptz, timestamptz) from public;
grant execute on function public.one_on_one_meetings_for_calendar(timestamptz, timestamptz) to authenticated;
