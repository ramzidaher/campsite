-- Outlook Calendar event ID columns for all calendar-generating entities.

-- Rota shifts: one event per assigned user
ALTER TABLE public.rota_shifts ADD COLUMN IF NOT EXISTS outlook_event_id text;

-- Calendar events: per-attendee table (mirrors interview_slot_outlook_events)
CREATE TABLE IF NOT EXISTS public.calendar_event_outlook_events (
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events (id) ON DELETE CASCADE,
  profile_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_id          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS cal_outlook_events_evt_idx
  ON public.calendar_event_outlook_events (calendar_event_id);

-- 1:1 meetings: one event each for manager and report
ALTER TABLE public.one_on_one_meetings
  ADD COLUMN IF NOT EXISTS outlook_event_id_manager text,
  ADD COLUMN IF NOT EXISTS outlook_event_id_report  text;

-- Approved leave: one all-day event for the requester
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS outlook_event_id text;
