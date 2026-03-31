-- Broadcast rota_shifts changes to Supabase Realtime so open rota UIs can refresh.
-- RLS still applies to which events a client receives.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rota_shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rota_shifts;
  END IF;
END $$;
