-- Multi-org registration/auth hardening:
-- - validated org signup invite tokens
-- - deferred join requests for existing accounts
-- - membership/org-switch audit logging
-- - canonical active-org guard (active membership only)

create table if not exists public.org_membership_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organisations (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  source text not null default 'unknown',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_membership_audit_events_org_created_idx
  on public.org_membership_audit_events (org_id, created_at desc);

create index if not exists org_membership_audit_events_target_created_idx
  on public.org_membership_audit_events (target_user_id, created_at desc);

alter table public.org_membership_audit_events enable row level security;

drop policy if exists org_membership_audit_events_select on public.org_membership_audit_events;
create policy org_membership_audit_events_select
  on public.org_membership_audit_events
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'users.view', '{}'::jsonb)
  );

drop policy if exists org_membership_audit_events_insert on public.org_membership_audit_events;
create policy org_membership_audit_events_insert
  on public.org_membership_audit_events
  for insert
  to service_role
  with check (true);

create table if not exists public.org_signup_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer,
  used_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint org_signup_invite_tokens_max_uses_check
    check (max_uses is null or max_uses > 0),
  constraint org_signup_invite_tokens_used_count_check
    check (used_count >= 0)
);

create index if not exists org_signup_invite_tokens_org_expires_idx
  on public.org_signup_invite_tokens (org_id, expires_at desc);

create index if not exists org_signup_invite_tokens_active_idx
  on public.org_signup_invite_tokens (expires_at, revoked_at);

alter table public.org_signup_invite_tokens enable row level security;

drop policy if exists org_signup_invite_tokens_none_select on public.org_signup_invite_tokens;
create policy org_signup_invite_tokens_none_select
  on public.org_signup_invite_tokens
  for select
  to authenticated
  using (false);

drop policy if exists org_signup_invite_tokens_none_insert on public.org_signup_invite_tokens;
create policy org_signup_invite_tokens_none_insert
  on public.org_signup_invite_tokens
  for insert
  to authenticated
  with check (false);

create table if not exists public.org_membership_join_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  email text not null,
  email_lower text generated always as (lower(trim(email))) stored,
  full_name text not null,
  dept_ids uuid[] not null default '{}'::uuid[],
  invite_token_id uuid not null references public.org_signup_invite_tokens (id) on delete restrict,
  status text not null default 'pending',
  requested_by_ip inet,
  requested_by_user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  constraint org_membership_join_requests_status_check
    check (status in ('pending', 'consumed', 'expired', 'cancelled'))
);

create index if not exists org_membership_join_requests_pending_email_idx
  on public.org_membership_join_requests (org_id, email_lower, status, created_at desc);

create index if not exists org_membership_join_requests_expires_idx
  on public.org_membership_join_requests (expires_at);

alter table public.org_membership_join_requests enable row level security;

drop policy if exists org_membership_join_requests_none_select on public.org_membership_join_requests;
create policy org_membership_join_requests_none_select
  on public.org_membership_join_requests
  for select
  to authenticated
  using (false);

drop policy if exists org_membership_join_requests_none_insert on public.org_membership_join_requests;
create policy org_membership_join_requests_none_insert
  on public.org_membership_join_requests
  for insert
  to authenticated
  with check (false);

create or replace function public.set_my_active_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = v_uid
      and m.org_id = p_org_id
      and m.status = 'active'
  ) then
    raise exception 'not an active member of this organisation' using errcode = '42501';
  end if;

  update public.profiles p
  set
    org_id = m.org_id,
    full_name = m.full_name,
    email = m.email,
    role = m.role,
    status = m.status,
    reviewed_at = m.reviewed_at,
    reviewed_by = m.reviewed_by,
    rejection_note = m.rejection_note
  from public.user_org_memberships m
  where p.id = v_uid
    and m.user_id = p.id
    and m.org_id = p_org_id
    and m.status = 'active';

  insert into public.org_membership_audit_events (
    org_id,
    actor_user_id,
    target_user_id,
    event_type,
    source,
    payload
  )
  values (
    p_org_id,
    v_uid,
    v_uid,
    'active_org_switch',
    'set_my_active_org',
    jsonb_build_object('org_id', p_org_id::text)
  );
end;
$$;

revoke all on function public.set_my_active_org(uuid) from public;
grant execute on function public.set_my_active_org(uuid) to authenticated;

