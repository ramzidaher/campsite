-- Allow HR admins to trigger metric evaluation once (same logic as cron).

create or replace function public.org_hr_metrics_run_now()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;
  perform public.hr_metrics_run_org(v_org);
end;
$$;

revoke all on function public.org_hr_metrics_run_now() from public;
grant execute on function public.org_hr_metrics_run_now() to authenticated;
