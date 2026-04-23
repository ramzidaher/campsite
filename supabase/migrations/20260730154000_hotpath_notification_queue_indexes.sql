-- Hot-path indexing pass for notification reads and queue polling.
-- Goal: keep UI badge/unread queries and worker polling consistently fast.

-- ---------------------------------------------------------------------------
-- 1) Unread notification read paths
-- ---------------------------------------------------------------------------

create index if not exists application_notifications_recipient_read_created_idx
  on public.application_notifications (recipient_id, read_at, created_at desc);

create index if not exists application_notifications_unread_recipient_idx
  on public.application_notifications (recipient_id)
  where read_at is null;

create index if not exists recruitment_notifications_recipient_read_created_idx
  on public.recruitment_notifications (recipient_id, read_at, created_at desc);

create index if not exists recruitment_notifications_unread_recipient_idx
  on public.recruitment_notifications (recipient_id)
  where read_at is null;

create index if not exists leave_notifications_recipient_read_created_idx
  on public.leave_notifications (recipient_id, read_at, created_at desc);

create index if not exists leave_notifications_unread_recipient_idx
  on public.leave_notifications (recipient_id)
  where read_at is null;

create index if not exists leave_finance_notifications_recipient_read_created_idx
  on public.leave_finance_notifications (recipient_id, read_at, created_at desc);

create index if not exists leave_finance_notifications_unread_recipient_idx
  on public.leave_finance_notifications (recipient_id)
  where read_at is null;

create index if not exists hr_metric_notifications_recipient_read_created_idx
  on public.hr_metric_notifications (recipient_id, read_at, created_at desc);

create index if not exists hr_metric_notifications_unread_recipient_idx
  on public.hr_metric_notifications (recipient_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- 2) Queue polling paths (processed_at IS NULL)
-- ---------------------------------------------------------------------------

create index if not exists broadcast_notification_jobs_pending_created_idx
  on public.broadcast_notification_jobs (created_at)
  where processed_at is null;

create index if not exists rota_notification_jobs_pending_created_idx
  on public.rota_notification_jobs (created_at)
  where processed_at is null;

create index if not exists one_on_one_notification_jobs_pending_created_idx
  on public.one_on_one_notification_jobs (created_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- 3) Rate-limit / token-attempt event lookup paths
-- ---------------------------------------------------------------------------

create index if not exists job_application_rate_limit_events_actor_attempted_idx
  on public.job_application_rate_limit_events (actor_key, attempted_at desc);

create index if not exists public_token_access_events_channel_actor_attempted_idx
  on public.public_token_access_events (channel, actor_key, attempted_at desc);
