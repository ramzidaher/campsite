-- Google Calendar event ID columns for all synced entity types.
-- calendar_events already has google_event_id from phase3 migration.

ALTER TABLE public.rota_shifts ADD COLUMN IF NOT EXISTS google_event_id text;

ALTER TABLE public.one_on_one_meetings
  ADD COLUMN IF NOT EXISTS google_event_id_manager text,
  ADD COLUMN IF NOT EXISTS google_event_id_report text;

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS google_event_id text;

-- Per-attendee tracking table for calendar events (mirrors calendar_event_outlook_events).
CREATE TABLE IF NOT EXISTS public.calendar_event_google_events (
  calendar_event_id uuid NOT NULL REFERENCES public.calendar_events (id) ON DELETE CASCADE,
  profile_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  event_id          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS cal_google_events_evt_idx
  ON public.calendar_event_google_events (calendar_event_id);

ALTER TABLE public.calendar_event_google_events ENABLE ROW LEVEL SECURITY;

-- Service role can manage; members can read their own rows for display purposes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_event_google_events'
      AND policyname = 'calendar_event_google_events_own'
  ) THEN
    CREATE POLICY calendar_event_google_events_own
      ON public.calendar_event_google_events
      FOR SELECT
      USING (profile_id = auth.uid());
  END IF;
END $$;
