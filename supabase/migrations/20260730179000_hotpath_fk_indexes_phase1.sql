-- Phase 1 FK-leading indexes on hot paths identified by audit view output.
-- Focus: dashboard fan-out queries, unread notifications, and queue processing tables.

-- Dashboard/calendar/broadcast hot paths
create index if not exists calendar_events_org_id_idx
  on public.calendar_events (org_id);

create index if not exists calendar_event_attendees_event_id_idx
  on public.calendar_event_attendees (event_id);

create index if not exists broadcasts_org_id_idx
  on public.broadcasts (org_id);

create index if not exists broadcasts_channel_id_idx
  on public.broadcasts (channel_id);

create index if not exists broadcasts_team_id_idx
  on public.broadcasts (team_id);

create index if not exists rota_shifts_org_id_idx
  on public.rota_shifts (org_id);

create index if not exists rota_shifts_rota_id_idx
  on public.rota_shifts (rota_id);

-- Notification fan-out / unread lookups
create index if not exists application_notifications_org_id_idx
  on public.application_notifications (org_id);

create index if not exists application_notifications_recipient_id_idx
  on public.application_notifications (recipient_id);

create index if not exists calendar_event_notifications_org_id_idx
  on public.calendar_event_notifications (org_id);

create index if not exists calendar_event_notifications_recipient_id_idx
  on public.calendar_event_notifications (recipient_id);

create index if not exists recruitment_notifications_org_id_idx
  on public.recruitment_notifications (org_id);

create index if not exists recruitment_notifications_recipient_id_idx
  on public.recruitment_notifications (recipient_id);

create index if not exists hr_metric_notifications_org_id_idx
  on public.hr_metric_notifications (org_id);

create index if not exists hr_metric_notifications_recipient_id_idx
  on public.hr_metric_notifications (recipient_id);

-- Queue/job relations
create index if not exists broadcast_notification_jobs_broadcast_id_idx
  on public.broadcast_notification_jobs (broadcast_id);

create index if not exists calendar_event_notification_jobs_event_id_idx
  on public.calendar_event_notification_jobs (event_id);

create index if not exists calendar_event_notification_jobs_org_id_idx
  on public.calendar_event_notification_jobs (org_id);

create index if not exists rota_notification_jobs_org_id_idx
  on public.rota_notification_jobs (org_id);

create index if not exists one_on_one_notification_jobs_org_id_idx
  on public.one_on_one_notification_jobs (org_id);
