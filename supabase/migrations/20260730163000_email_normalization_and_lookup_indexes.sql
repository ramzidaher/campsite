-- Email normalization + lookup hardening.
-- Safe for multi-org + external applicant model:
-- - normalize (trim/lower) on write
-- - add case-insensitive lookup indexes
-- - do NOT add broad global unique constraints that could break valid cross-org cases

create or replace function public.normalize_email_value(p_email text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

comment on function public.normalize_email_value(text) is
  'Normalizes email text by trim+lower; empty becomes null.';

create or replace function public.profiles_normalize_email_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := public.normalize_email_value(new.email);
  return new;
end;
$$;

create or replace function public.user_org_memberships_normalize_email_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := public.normalize_email_value(new.email);
  return new;
end;
$$;

create or replace function public.job_applications_normalize_candidate_email_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.candidate_email := public.normalize_email_value(new.candidate_email);
  return new;
end;
$$;

create or replace function public.google_connections_normalize_google_email_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.google_email := public.normalize_email_value(new.google_email);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing rows first
-- ---------------------------------------------------------------------------

update public.profiles
set email = public.normalize_email_value(email)
where email is distinct from public.normalize_email_value(email);

update public.user_org_memberships
set email = public.normalize_email_value(email)
where email is distinct from public.normalize_email_value(email);

update public.job_applications
set candidate_email = public.normalize_email_value(candidate_email)
where candidate_email is distinct from public.normalize_email_value(candidate_email);

update public.google_connections
set google_email = public.normalize_email_value(google_email)
where google_email is distinct from public.normalize_email_value(google_email);

-- ---------------------------------------------------------------------------
-- Normalize on write
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_normalize_email_trg on public.profiles;
create trigger profiles_normalize_email_trg
before insert or update of email
on public.profiles
for each row
execute function public.profiles_normalize_email_trg_fn();

drop trigger if exists user_org_memberships_normalize_email_trg on public.user_org_memberships;
create trigger user_org_memberships_normalize_email_trg
before insert or update of email
on public.user_org_memberships
for each row
execute function public.user_org_memberships_normalize_email_trg_fn();

drop trigger if exists job_applications_normalize_candidate_email_trg on public.job_applications;
create trigger job_applications_normalize_candidate_email_trg
before insert or update of candidate_email
on public.job_applications
for each row
execute function public.job_applications_normalize_candidate_email_trg_fn();

drop trigger if exists google_connections_normalize_google_email_trg on public.google_connections;
create trigger google_connections_normalize_google_email_trg
before insert or update of google_email
on public.google_connections
for each row
execute function public.google_connections_normalize_google_email_trg_fn();

-- ---------------------------------------------------------------------------
-- Case-insensitive lookup indexes
-- ---------------------------------------------------------------------------

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email))
  where email is not null;

create index if not exists user_org_memberships_email_lower_idx
  on public.user_org_memberships (lower(email))
  where email is not null;

create index if not exists job_applications_candidate_email_lower_idx
  on public.job_applications (lower(candidate_email))
  where candidate_email is not null;

create index if not exists google_connections_google_email_lower_idx
  on public.google_connections (lower(google_email))
  where google_email is not null;
