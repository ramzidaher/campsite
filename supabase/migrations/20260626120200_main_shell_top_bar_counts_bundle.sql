-- Batches broadcast + notification unread counts for the main app shell into one RPC.
-- Reduces 5 HTTP round trips (localhost) to 1 (critical for production latency vs Supabase region).

create or replace function public.main_shell_top_bar_counts_bundle()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'broadcast_unread',
    (
      select count(*)::integer
      from public.broadcasts b
      where b.status = 'sent'
        and public.broadcast_visible_to_reader(b)
        and not exists (
          select 1
          from public.broadcast_reads r
          where r.broadcast_id = b.id
            and r.user_id = auth.uid()
        )
    ),
    'recruitment_notifications',
    (
      select count(*)::integer
      from public.recruitment_notifications
      where recipient_id = auth.uid()
        and read_at is null
    ),
    'application_notifications',
    (
      select count(*)::integer
      from public.application_notifications
      where recipient_id = auth.uid()
        and read_at is null
    ),
    'leave_notifications',
    (
      select count(*)::integer
      from public.leave_notifications
      where recipient_id = auth.uid()
        and read_at is null
    ),
    'hr_metric_notifications',
    (
      select count(*)::integer
      from public.hr_metric_notifications
      where recipient_id = auth.uid()
        and read_at is null
    )
  );
$$;

revoke all on function public.main_shell_top_bar_counts_bundle() from public;
grant execute on function public.main_shell_top_bar_counts_bundle() to authenticated;
