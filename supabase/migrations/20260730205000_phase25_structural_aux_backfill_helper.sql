-- Phase 2.5 helper: controlled structural aux backfill/warmup.

create or replace function public.backfill_user_shell_structural_aux(p_batch integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
begin
  insert into public.shell_structural_aux_recalc_queue (user_id, reason, requested_at)
  select p.id, 'phase25_structural_aux_backfill', now()
  from public.profiles p
  where p.org_id is not null
    and p.status = 'active'
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = excluded.reason
  where public.shell_structural_aux_recalc_queue.requested_at < (now() - interval '15 seconds');

  v_processed := public.process_shell_structural_aux_recalc_queue(greatest(1, least(coalesce(p_batch, 1000), 5000)));
  return v_processed;
end;
$$;

grant execute on function public.backfill_user_shell_structural_aux(integer) to authenticated;
