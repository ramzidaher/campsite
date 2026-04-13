-- Tighten profile read least-privilege and harden public portal tokens.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Profiles: permission-aware sensitive reads + minimal coworker directory
-- ---------------------------------------------------------------------------

create or replace function public.can_view_profile_sensitive(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_org_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_viewer_user_id is null or p_target_user_id is null or p_org_id is null then
    return false;
  end if;
  if p_viewer_user_id = p_target_user_id then
    return true;
  end if;
  if public.is_platform_founder(p_viewer_user_id) then
    return true;
  end if;
  return
    public.has_permission(p_viewer_user_id, p_org_id, 'members.view', '{}'::jsonb)
    or public.has_permission(p_viewer_user_id, p_org_id, 'hr.view_records', '{}'::jsonb);
end;
$$;

drop policy if exists profiles_select_department_isolation on public.profiles;

create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (public.can_view_profile_sensitive(auth.uid(), profiles.id, profiles.org_id));

create or replace view public.coworker_directory_public as
select
  p.id,
  p.org_id,
  p.full_name,
  p.role,
  p.status
from public.profiles p
where p.status = 'active';

grant select on public.coworker_directory_public to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Portal tokens: hash-at-rest + expiry + replay controls
-- ---------------------------------------------------------------------------

alter table public.job_applications
  add column if not exists portal_token_hash text,
  add column if not exists portal_token_expires_at timestamptz,
  add column if not exists portal_token_last_used_at timestamptz,
  add column if not exists portal_token_revoked_at timestamptz,
  add column if not exists portal_token_use_count integer not null default 0;

alter table public.application_offers
  add column if not exists portal_token_hash text,
  add column if not exists portal_token_expires_at timestamptz,
  add column if not exists portal_token_last_used_at timestamptz,
  add column if not exists portal_token_revoked_at timestamptz,
  add column if not exists portal_token_use_count integer not null default 0;

update public.job_applications
set
  portal_token_hash = encode(extensions.digest(convert_to(portal_token, 'UTF8'), 'sha256'), 'hex'),
  portal_token_expires_at = coalesce(portal_token_expires_at, submitted_at + interval '30 days')
where portal_token is not null
  and (portal_token_hash is null or portal_token_expires_at is null);

update public.application_offers
set
  portal_token_hash = encode(extensions.digest(convert_to(portal_token, 'UTF8'), 'sha256'), 'hex'),
  portal_token_expires_at = coalesce(portal_token_expires_at, created_at + interval '14 days')
where portal_token is not null
  and (portal_token_hash is null or portal_token_expires_at is null);

create unique index if not exists job_applications_portal_token_hash_uidx
  on public.job_applications (portal_token_hash)
  where portal_token_hash is not null;

create unique index if not exists application_offers_portal_token_hash_uidx
  on public.application_offers (portal_token_hash)
  where portal_token_hash is not null;

alter table public.job_applications
  alter column portal_token drop not null;

alter table public.application_offers
  alter column portal_token drop not null;

create or replace function public.scrub_portal_token_job_applications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.portal_token is not null then
    update public.job_applications
    set
      portal_token_hash = coalesce(new.portal_token_hash, encode(extensions.digest(convert_to(new.portal_token, 'UTF8'), 'sha256'), 'hex')),
      portal_token_expires_at = coalesce(new.portal_token_expires_at, new.submitted_at + interval '30 days'),
      portal_token = null
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists scrub_portal_token_job_applications_trg on public.job_applications;
create trigger scrub_portal_token_job_applications_trg
after insert or update on public.job_applications
for each row
when (new.portal_token is not null)
execute procedure public.scrub_portal_token_job_applications();

create or replace function public.scrub_portal_token_application_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.portal_token is not null then
    update public.application_offers
    set
      portal_token_hash = coalesce(new.portal_token_hash, encode(extensions.digest(convert_to(new.portal_token, 'UTF8'), 'sha256'), 'hex')),
      portal_token_expires_at = coalesce(new.portal_token_expires_at, new.created_at + interval '14 days'),
      portal_token = null
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists scrub_portal_token_application_offers_trg on public.application_offers;
create trigger scrub_portal_token_application_offers_trg
after insert or update on public.application_offers
for each row
when (new.portal_token is not null)
execute procedure public.scrub_portal_token_application_offers();

drop function if exists public.get_candidate_application_portal(text);
create or replace function public.get_candidate_application_portal(p_portal_token text)
returns table (
  org_name text,
  job_title text,
  stage text,
  submitted_at timestamptz,
  interview_joining_instructions text,
  messages jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tid text := nullif(trim(p_portal_token), '');
  v_hash text := null;
begin
  if v_tid is null then
    return;
  end if;
  v_hash := encode(extensions.digest(convert_to(v_tid, 'UTF8'), 'sha256'), 'hex');

  return query
  select
    o.name::text,
    jl.title::text,
    ja.stage::text,
    ja.submitted_at,
    ja.interview_joining_instructions::text,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('body', m.body, 'created_at', m.created_at)
          order by m.created_at nulls last
        )
        from public.job_application_messages m
        where m.job_application_id = ja.id
      ),
      '[]'::jsonb
    )
  from public.job_applications ja
  join public.job_listings jl on jl.id = ja.job_listing_id
  join public.organisations o on o.id = ja.org_id
  where ja.portal_token_hash = v_hash
    and ja.portal_token_revoked_at is null
    and coalesce(ja.portal_token_expires_at, now() + interval '1 second') > now();
end;
$$;

grant execute on function public.get_candidate_application_portal(text) to anon, authenticated;

drop function if exists public.get_application_offer_for_signing(text);
create or replace function public.get_application_offer_for_signing(p_portal_token text)
returns table (
  body_html text,
  status text,
  org_name text,
  candidate_name text,
  job_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t text := nullif(trim(p_portal_token), '');
  v_hash text := null;
begin
  if v_t is null then
    return;
  end if;
  v_hash := encode(extensions.digest(convert_to(v_t, 'UTF8'), 'sha256'), 'hex');

  return query
  select
    o.body_html,
    o.status::text,
    org.name::text,
    ja.candidate_name::text,
    jl.title::text
  from public.application_offers o
  join public.job_applications ja on ja.id = o.job_application_id
  join public.organisations org on org.id = o.org_id
  join public.job_listings jl on jl.id = ja.job_listing_id
  where o.portal_token_hash = v_hash
    and o.portal_token_revoked_at is null
    and coalesce(o.portal_token_expires_at, now() + interval '1 second') > now()
    and o.status = 'sent'
    and org.is_active = true;
end;
$$;

grant execute on function public.get_application_offer_for_signing(text) to anon, authenticated;

create table if not exists public.public_token_access_events (
  id bigserial primary key,
  channel text not null,
  actor_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists public_token_access_events_lookup_idx
  on public.public_token_access_events (channel, actor_key, attempted_at desc);

create or replace function public.record_public_token_attempt(p_channel text, p_actor_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel text := nullif(trim(p_channel), '');
  v_actor text := nullif(trim(p_actor_key), '');
  v_count int := 0;
begin
  if v_channel is null or v_actor is null then
    return false;
  end if;
  insert into public.public_token_access_events (channel, actor_key)
  values (v_channel, v_actor);
  select count(*)::int into v_count
  from public.public_token_access_events e
  where e.channel = v_channel
    and e.actor_key = v_actor
    and e.attempted_at >= now() - interval '10 minutes';
  return v_count <= 60;
end;
$$;

grant execute on function public.record_public_token_attempt(text, text) to anon, authenticated;
