-- Swap / change requests: peer accept (swap) then final approval by any org manager or duty_manager.

create table if not exists public.rota_change_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  request_type text not null check (request_type in ('swap', 'change')),
  primary_shift_id uuid not null references public.rota_shifts (id) on delete cascade,
  counterparty_shift_id uuid references public.rota_shifts (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  counterparty_user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending_peer'
    check (status in ('pending_peer', 'pending_final', 'approved', 'rejected', 'cancelled')),
  note text,
  peer_accepted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index if not exists rota_change_requests_org_status_idx
  on public.rota_change_requests (org_id, status);
create index if not exists rota_change_requests_requested_by_idx
  on public.rota_change_requests (requested_by);
create index if not exists rota_change_requests_counterparty_idx
  on public.rota_change_requests (counterparty_user_id)
  where counterparty_user_id is not null;

comment on table public.rota_change_requests is
  'Rota swap (peer + manager/duty_manager) or change request (final approval only).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_final_approve_rota_request(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.org_id = p_org_id
      and p.status = 'active'
      and p.role in ('manager', 'duty_manager', 'org_admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.rota_change_requests enable row level security;

drop policy if exists rota_change_requests_select on public.rota_change_requests;
create policy rota_change_requests_select
  on public.rota_change_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      requested_by = auth.uid()
      or counterparty_user_id = auth.uid()
      or public.can_final_approve_rota_request(org_id)
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.org_id = org_id
          and p.role in ('org_admin', 'super_admin', 'coordinator')
      )
    )
  );

-- Mutations only via SECURITY DEFINER RPCs (prevents status tampering).

-- ---------------------------------------------------------------------------
-- RPCs (state transitions + apply)
-- ---------------------------------------------------------------------------

create or replace function public.rota_change_request_submit_swap(
  p_primary_shift_id uuid,
  p_counterparty_shift_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s1 record;
  s2 record;
  rid uuid;
  cp uuid;
begin
  select * into s1 from public.rota_shifts where id = p_primary_shift_id;
  select * into s2 from public.rota_shifts where id = p_counterparty_shift_id;
  if s1.id is null or s2.id is null then
    raise exception 'Shift not found';
  end if;
  if s1.org_id <> public.current_org_id() or s2.org_id <> s1.org_id then
    raise exception 'Invalid org';
  end if;
  if s1.user_id is distinct from auth.uid() then
    raise exception 'You must be assigned to the primary shift';
  end if;
  if s2.user_id is null or s2.user_id = auth.uid() then
    raise exception 'Invalid counterparty shift';
  end if;

  cp := s2.user_id;

  insert into public.rota_change_requests (
    org_id, request_type, primary_shift_id, counterparty_shift_id,
    requested_by, counterparty_user_id, status
  ) values (
    s1.org_id, 'swap', p_primary_shift_id, p_counterparty_shift_id,
    auth.uid(), cp, 'pending_peer'
  )
  returning id into rid;

  return rid;
end;
$$;

grant execute on function public.rota_change_request_submit_swap(uuid, uuid) to authenticated;

create or replace function public.rota_change_request_submit_change(
  p_shift_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  rid uuid;
begin
  select * into s from public.rota_shifts where id = p_shift_id;
  if s.id is null or s.org_id <> public.current_org_id() then
    raise exception 'Shift not found';
  end if;
  if s.user_id is distinct from auth.uid() then
    raise exception 'You must be assigned to this shift';
  end if;

  insert into public.rota_change_requests (
    org_id, request_type, primary_shift_id, counterparty_shift_id,
    requested_by, counterparty_user_id, status, note
  ) values (
    s.org_id, 'change', p_shift_id, null,
    auth.uid(), null, 'pending_final', nullif(trim(p_note), '')
  )
  returning id into rid;

  return rid;
end;
$$;

grant execute on function public.rota_change_request_submit_change(uuid, text) to authenticated;

create or replace function public.rota_change_request_peer_accept(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.rota_change_requests where id = p_request_id;
  if r.id is null or r.org_id <> public.current_org_id() then
    raise exception 'Request not found';
  end if;
  if r.request_type <> 'swap' or r.status <> 'pending_peer' then
    raise exception 'Invalid state';
  end if;
  if r.counterparty_user_id is distinct from auth.uid() then
    raise exception 'Only the counterparty may accept';
  end if;

  update public.rota_change_requests
  set status = 'pending_final', peer_accepted_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.rota_change_request_peer_accept(uuid) to authenticated;

create or replace function public.rota_change_request_final_approve(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  s1 record;
  s2 record;
  u1 uuid;
  u2 uuid;
begin
  select * into r from public.rota_change_requests where id = p_request_id;
  if r.id is null or r.org_id <> public.current_org_id() then
    raise exception 'Request not found';
  end if;
  if not public.can_final_approve_rota_request(r.org_id) then
    raise exception 'Not allowed to approve';
  end if;
  if r.status <> 'pending_final' then
    raise exception 'Request is not awaiting final approval';
  end if;

  if r.request_type = 'swap' then
    select * into s1 from public.rota_shifts where id = r.primary_shift_id for update;
    select * into s2 from public.rota_shifts where id = r.counterparty_shift_id for update;
    if s1.id is null or s2.id is null then
      raise exception 'Shift missing';
    end if;
    if s1.user_id is distinct from r.requested_by or s2.user_id is distinct from r.counterparty_user_id then
      raise exception 'Assignments changed since request';
    end if;
    u1 := s1.user_id;
    u2 := s2.user_id;
    update public.rota_shifts set user_id = u2 where id = s1.id;
    update public.rota_shifts set user_id = u1 where id = s2.id;
  elsif r.request_type = 'change' then
    update public.rota_shifts set user_id = null where id = r.primary_shift_id;
  end if;

  update public.rota_change_requests
  set status = 'approved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_request_id;
end;
$$;

grant execute on function public.rota_change_request_final_approve(uuid) to authenticated;

create or replace function public.rota_change_request_final_reject(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.rota_change_requests where id = p_request_id;
  if r.id is null or r.org_id <> public.current_org_id() then
    raise exception 'Request not found';
  end if;
  if not public.can_final_approve_rota_request(r.org_id) then
    raise exception 'Not allowed';
  end if;
  if r.status not in ('pending_peer', 'pending_final') then
    raise exception 'Invalid state';
  end if;

  update public.rota_change_requests
  set
    status = 'rejected',
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_note = nullif(trim(p_note), '')
  where id = p_request_id;
end;
$$;

grant execute on function public.rota_change_request_final_reject(uuid, text) to authenticated;

create or replace function public.rota_change_request_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.rota_change_requests where id = p_request_id;
  if r.id is null or r.org_id <> public.current_org_id() then
    raise exception 'Request not found';
  end if;
  if r.requested_by is distinct from auth.uid() then
    raise exception 'Only requester may cancel';
  end if;
  if r.status not in ('pending_peer', 'pending_final') then
    raise exception 'Invalid state';
  end if;

  update public.rota_change_requests
  set status = 'cancelled', resolved_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.rota_change_request_cancel(uuid) to authenticated;
