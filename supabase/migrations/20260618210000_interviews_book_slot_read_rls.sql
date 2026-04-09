-- Allow users with interviews.book_slot (but not necessarily interviews.view) to read
-- interview slots and related rows needed for booking and the schedule UI.

drop policy if exists interview_slots_select_rbac on public.interview_slots;
create policy interview_slots_select_rbac
  on public.interview_slots
  for select
  to authenticated
  using (
    (
      org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), org_id, 'interviews.view', '{}'::jsonb)
        or public.has_permission(auth.uid(), org_id, 'interviews.manage', '{}'::jsonb)
        or public.has_permission(auth.uid(), org_id, 'interviews.book_slot', '{}'::jsonb)
      )
    )
    or exists (
      select 1 from public.interview_slot_panelists p
      where p.slot_id = interview_slots.id
        and p.profile_id = auth.uid()
    )
  );

drop policy if exists interview_slot_panelists_select_self_or_rbac on public.interview_slot_panelists;
create policy interview_slot_panelists_select_self_or_rbac
  on public.interview_slot_panelists
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_panelists.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.view', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.book_slot', '{}'::jsonb)
        )
    )
  );

drop policy if exists job_listings_select_rbac on public.job_listings;
create policy job_listings_select_rbac
  on public.job_listings
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.book_slot', '{}'::jsonb)
    )
  );

drop policy if exists interview_slot_google_events_select_rbac on public.interview_slot_google_events;
create policy interview_slot_google_events_select_rbac
  on public.interview_slot_google_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.view', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.book_slot', '{}'::jsonb)
        )
    )
  );
