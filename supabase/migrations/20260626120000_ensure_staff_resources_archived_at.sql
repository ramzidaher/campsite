-- Idempotent repair: ensure archived_at exists (e.g. partial deploy or drift).
-- Safe if 20260625120000_staff_resources_archived_at.sql already ran.

alter table public.staff_resources
  add column if not exists archived_at timestamptz null;
