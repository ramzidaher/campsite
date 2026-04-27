-- Recruitment governance fields + strict status transition guards.

alter table public.recruitment_requests
  add column if not exists business_case text,
  add column if not exists headcount_type text check (headcount_type in ('new', 'backfill')),
  add column if not exists cost_center text,
  add column if not exists budget_approved boolean not null default false,
  add column if not exists target_start_window text,
  add column if not exists hiring_owner_user_id uuid references public.profiles (id) on delete set null;

create index if not exists recruitment_requests_hiring_owner_idx
  on public.recruitment_requests (hiring_owner_user_id);

create or replace function public.set_recruitment_request_status(
  p_request_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  rec public.recruitment_requests%rowtype;
  v_old text;
  v_transition_allowed boolean := false;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select * into rec from public.recruitment_requests where id = p_request_id;
  if not found then
    raise exception 'recruitment request not found';
  end if;

  if rec.org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.has_permission(
    v_viewer,
    rec.org_id,
    'recruitment.approve_request',
    '{}'::jsonb
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_status not in ('pending_review', 'approved', 'in_progress', 'filled', 'rejected')
  then
    raise exception 'invalid status';
  end if;

  v_old := rec.status;
  if v_old = p_new_status then
    return;
  end if;

  v_transition_allowed := (
    (v_old = 'pending_review' and p_new_status in ('approved', 'rejected'))
    or (v_old = 'approved' and p_new_status in ('in_progress', 'rejected'))
    or (v_old = 'in_progress' and p_new_status in ('filled', 'rejected'))
  );

  if not v_transition_allowed then
    raise exception 'invalid transition: % -> %', v_old, p_new_status;
  end if;

  if p_new_status = 'approved' then
    if coalesce(trim(rec.business_case), '') = '' then
      raise exception 'business_case is required before approval';
    end if;
    if coalesce(trim(rec.cost_center), '') = '' then
      raise exception 'cost_center is required before approval';
    end if;
    if coalesce(trim(rec.target_start_window), '') = '' then
      raise exception 'target_start_window is required before approval';
    end if;
    if rec.hiring_owner_user_id is null then
      raise exception 'hiring_owner_user_id is required before approval';
    end if;
    if coalesce(rec.headcount_type, '') not in ('new', 'backfill') then
      raise exception 'headcount_type is required before approval';
    end if;
    if rec.budget_approved is not true then
      raise exception 'budget must be approved before approval';
    end if;
  end if;

  update public.recruitment_requests
  set
    status = p_new_status,
    archived_at = case
      when p_new_status in ('filled', 'rejected') then coalesce(rec.archived_at, now())
      else null
    end
  where id = p_request_id;

  insert into public.recruitment_request_status_events (
    request_id,
    org_id,
    from_status,
    to_status,
    changed_by,
    note
  ) values (
    p_request_id,
    rec.org_id,
    v_old,
    p_new_status,
    v_viewer,
    nullif(trim(p_note), '')
  );
end;
$$;

grant execute on function public.set_recruitment_request_status(uuid, text, text) to authenticated;
