-- Restrict org-wide 1:1 calendar visibility to an explicit permission key.
-- Users without this key can still see meetings where they are a participant.

insert into public.permission_catalog (key, label, description, is_founder_only)
values (
  'one_on_one.view_all_checkins',
  'View all 1:1 check-ins',
  'View all scheduled and in-progress 1:1 check-ins across the organisation calendar.',
  false
)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

-- Seed roles that already have HR-record visibility with org-wide 1:1 calendar visibility.
insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'one_on_one.view_all_checkins'
from public.org_role_permissions rp
where rp.permission_key = 'hr.view_records'
on conflict do nothing;

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
  v_can_view_all boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_can_view_all := public.has_permission(v_uid, v_org, 'one_on_one.view_all_checkins', '{}'::jsonb);

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
           v_can_view_all
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
