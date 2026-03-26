-- Denormalised email for manager approval UI (auth.users is not exposed to RLS clients).
alter table public.profiles add column if not exists email text;
