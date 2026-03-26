-- Aligns local migration history with hosted Supabase: version was applied remotely
-- before this file existed in the repo. Safe no-op for databases that already ran it.

select 1;
