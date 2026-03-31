-- Promote due scheduled broadcasts to sent (same logic as pg_cron job in phase2).
-- Callable by service_role from Edge (process-broadcast-notifications) so scheduling works
-- when pg_cron is unavailable or not configured.

create or replace function public.release_due_scheduled_broadcasts()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.broadcasts
  set
    status = 'sent',
    sent_at = coalesce(sent_at, now())
  where status = 'scheduled'
    and scheduled_at is not null
    and scheduled_at <= now();

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.release_due_scheduled_broadcasts() from public;
grant execute on function public.release_due_scheduled_broadcasts() to service_role;

comment on function public.release_due_scheduled_broadcasts() is
  'Sets status to sent for broadcasts past scheduled_at; fires notify trigger. service_role / cron only.';
