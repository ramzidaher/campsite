-- Add server-captured request IP support to legal acceptance evidence.

alter table public.legal_acceptance_events
  add column if not exists request_ip inet;

comment on column public.legal_acceptance_events.request_ip is
  'Best-effort client IP captured server-side at acceptance record time.';

create index if not exists legal_acceptance_events_request_ip_idx
  on public.legal_acceptance_events (request_ip)
  where request_ip is not null;

create or replace function public.record_legal_acceptance_event(
  p_user_id uuid,
  p_profile_id uuid,
  p_org_id uuid,
  p_email text,
  p_bundle_version text,
  p_accepted_at timestamptz default now(),
  p_acceptance_source text default 'registration',
  p_request_host text default null,
  p_request_path text default null,
  p_user_agent text default null,
  p_request_ip inet default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle text;
  v_id uuid;
begin
  v_bundle := nullif(trim(coalesce(p_bundle_version, '')), '');
  if v_bundle is null then
    raise exception 'bundle version required';
  end if;

  insert into public.legal_acceptance_events (
    user_id,
    profile_id,
    org_id,
    email,
    acceptance_source,
    bundle_version,
    legal_text_sha256,
    accepted_at,
    request_host,
    request_path,
    user_agent,
    request_ip,
    evidence
  )
  values (
    p_user_id,
    p_profile_id,
    p_org_id,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(nullif(trim(p_acceptance_source), ''), 'registration'),
    v_bundle,
    public.compute_legal_bundle_sha256(v_bundle),
    coalesce(p_accepted_at, now()),
    nullif(trim(coalesce(p_request_host, '')), ''),
    nullif(trim(coalesce(p_request_path, '')), ''),
    case
      when p_user_agent is null then null
      when length(p_user_agent) > 2048 then left(p_user_agent, 2048)
      else p_user_agent
    end,
    p_request_ip,
    coalesce(p_evidence, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_my_legal_acceptance(
  p_bundle_version text,
  p_accepted_at timestamptz default now(),
  p_acceptance_source text default 'registration_fallback',
  p_request_host text default null,
  p_request_path text default null,
  p_user_agent text default null,
  p_request_ip inet default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_org_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select p.id, p.org_id, p.email
  into v_profile_id, v_org_id, v_email
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  return public.record_legal_acceptance_event(
    auth.uid(),
    v_profile_id,
    v_org_id,
    v_email,
    p_bundle_version,
    p_accepted_at,
    p_acceptance_source,
    p_request_host,
    p_request_path,
    p_user_agent,
    p_request_ip,
    p_evidence
  );
end;
$$;

grant execute on function public.record_my_legal_acceptance(
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  inet,
  jsonb
) to authenticated;

create or replace function public.platform_list_legal_acceptance_events(
  p_bundle_version text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  org_id uuid,
  email text,
  acceptance_source text,
  bundle_version text,
  legal_text_sha256 text,
  accepted_at timestamptz,
  request_host text,
  request_path text,
  user_agent text,
  request_ip inet,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_bundle text := nullif(trim(coalesce(p_bundle_version, '')), '');
begin
  if auth.uid() is null or not public.is_platform_founder(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  with filtered as (
    select e.*
    from public.legal_acceptance_events e
    where v_bundle is null or e.bundle_version = v_bundle
  )
  select
    f.id,
    f.user_id,
    f.org_id,
    f.email,
    f.acceptance_source,
    f.bundle_version,
    f.legal_text_sha256,
    f.accepted_at,
    f.request_host,
    f.request_path,
    f.user_agent,
    f.request_ip,
    f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.accepted_at desc, f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;
