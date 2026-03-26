-- Sending a broadcast (status = 'sent') fires AFTER INSERT trigger broadcasts_queue_notify_fn,
-- which inserts into broadcast_notification_jobs. That table had RLS with a deny-all policy
-- for `authenticated` only. When the nested INSERT runs in the client session role, Postgres
-- rejects it and rolls back the whole broadcasts INSERT — PostgREST returns 400.
--
-- Allow enqueue rows that reference a sent broadcast created by the current user (same txn).

create policy broadcast_notification_jobs_insert_own_sent_broadcast
  on public.broadcast_notification_jobs
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_notification_jobs.broadcast_id
        and b.created_by = auth.uid()
        and b.status = 'sent'
    )
  );
