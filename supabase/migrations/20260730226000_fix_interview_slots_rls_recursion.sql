-- Fix infinite RLS recursion between interview_slots and interview_slot_panelists.
-- Root cause:
-- - interview_slots SELECT policy checked interview_slot_panelists.
-- - interview_slot_panelists SELECT policy checked interview_slots.
-- This creates a recursive policy evaluation loop.

create or replace function public.is_interview_slot_panelist(
  p_slot_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.interview_slot_panelists p
    where p.slot_id = p_slot_id
      and p.profile_id = p_profile_id
  );
$$;

grant execute on function public.is_interview_slot_panelist(uuid, uuid) to authenticated;

create or replace function public.can_read_interview_slot(
  p_viewer_user_id uuid,
  p_slot_id uuid,
  p_slot_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer_user_id is not null
    and p_slot_id is not null
    and p_slot_org_id is not null
    and (
      (
        p_slot_org_id = public.current_org_id()
        and (
          public.has_permission(p_viewer_user_id, p_slot_org_id, 'interviews.view', '{}'::jsonb)
          or public.has_permission(p_viewer_user_id, p_slot_org_id, 'interviews.manage', '{}'::jsonb)
          or public.has_permission(p_viewer_user_id, p_slot_org_id, 'interviews.book_slot', '{}'::jsonb)
        )
      )
      or public.is_interview_slot_panelist(p_slot_id, p_viewer_user_id)
    );
$$;

grant execute on function public.can_read_interview_slot(uuid, uuid, uuid) to authenticated;

create or replace function public.can_read_interview_slot_panelist_row(
  p_viewer_user_id uuid,
  p_slot_id uuid,
  p_panelist_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer_user_id is not null
    and p_slot_id is not null
    and (
      p_panelist_profile_id = p_viewer_user_id
      or exists (
        select 1
        from public.interview_slots s
        where s.id = p_slot_id
          and s.org_id = public.current_org_id()
          and (
            public.has_permission(p_viewer_user_id, s.org_id, 'interviews.view', '{}'::jsonb)
            or public.has_permission(p_viewer_user_id, s.org_id, 'interviews.manage', '{}'::jsonb)
            or public.has_permission(p_viewer_user_id, s.org_id, 'interviews.create_slot', '{}'::jsonb)
            or public.has_permission(p_viewer_user_id, s.org_id, 'interviews.book_slot', '{}'::jsonb)
          )
      )
    );
$$;

grant execute on function public.can_read_interview_slot_panelist_row(uuid, uuid, uuid) to authenticated;

drop policy if exists interview_slots_select_rbac on public.interview_slots;
create policy interview_slots_select_rbac
  on public.interview_slots
  for select
  to authenticated
  using (
    public.can_read_interview_slot((select auth.uid()), interview_slots.id, interview_slots.org_id)
  );

drop policy if exists interview_slot_panelists_select_self_or_rbac on public.interview_slot_panelists;
create policy interview_slot_panelists_select_self_or_rbac
  on public.interview_slot_panelists
  for select
  to authenticated
  using (
    public.can_read_interview_slot_panelist_row(
      (select auth.uid()),
      interview_slot_panelists.slot_id,
      interview_slot_panelists.profile_id
    )
  );
