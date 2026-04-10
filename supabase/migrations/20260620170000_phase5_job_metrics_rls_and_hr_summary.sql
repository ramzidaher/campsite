-- Phase 5: lock down public job metrics storage; HR reads via permission-checked RPC only.

alter table public.job_listing_public_metrics enable row level security;

-- No SELECT/INSERT policies for anon/authenticated: writes go through security definer
-- `track_public_job_metric`; reads go through `get_job_listing_public_metrics_summary`.

drop function if exists public.get_job_listing_public_metrics_summary(uuid);

create or replace function public.get_job_listing_public_metrics_summary(p_job_listing_id uuid)
returns table (
  impression_count bigint,
  apply_start_count bigint,
  apply_submit_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null or p_job_listing_id is null then
    return;
  end if;

  select jl.org_id into v_org
  from public.job_listings jl
  where jl.id = p_job_listing_id;

  if v_org is null then
    return;
  end if;

  if not public.has_permission(v_uid, v_org, 'jobs.edit', '{}'::jsonb) then
    return;
  end if;

  return query
  select
    coalesce(count(*) filter (where m.event_type = 'impression'), 0)::bigint,
    coalesce(count(*) filter (where m.event_type = 'apply_start'), 0)::bigint,
    coalesce(count(*) filter (where m.event_type = 'apply_submit'), 0)::bigint
  from public.job_listing_public_metrics m
  where m.job_listing_id = p_job_listing_id
    and m.org_id = v_org;
end;
$$;

grant execute on function public.get_job_listing_public_metrics_summary(uuid) to authenticated;
