-- Align DB authorization with RBAC permission keys for HR/recruitment modules.

-- ---------------------------------------------------------------------------
-- Recruitment requests + events RLS
-- ---------------------------------------------------------------------------

drop policy if exists recruitment_requests_select_org_admin on public.recruitment_requests;
drop policy if exists recruitment_requests_select_manager_own on public.recruitment_requests;
drop policy if exists recruitment_requests_insert_manager on public.recruitment_requests;

create policy recruitment_requests_select_rbac
  on public.recruitment_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'recruitment.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'recruitment.approve_request', '{}'::jsonb)
      or (
        created_by = auth.uid()
        and public.has_permission(auth.uid(), org_id, 'recruitment.create_request', '{}'::jsonb)
      )
    )
  );

create policy recruitment_requests_insert_rbac
  on public.recruitment_requests
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and public.has_permission(auth.uid(), org_id, 'recruitment.create_request', '{}'::jsonb)
    and (
      public.has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'recruitment.approve_request', '{}'::jsonb)
      or exists (
        select 1
        from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = department_id
      )
    )
  );

drop policy if exists recruitment_request_status_events_select_org_admin on public.recruitment_request_status_events;
drop policy if exists recruitment_request_status_events_select_manager_own on public.recruitment_request_status_events;

create policy recruitment_request_status_events_select_rbac
  on public.recruitment_request_status_events
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'recruitment.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'recruitment.approve_request', '{}'::jsonb)
      or exists (
        select 1
        from public.recruitment_requests r
        where r.id = recruitment_request_status_events.request_id
          and r.created_by = auth.uid()
          and public.has_permission(auth.uid(), r.org_id, 'recruitment.create_request', '{}'::jsonb)
      )
    )
  );

create or replace function public.recruitment_requests_pending_review_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_permission(auth.uid(), public.current_org_id(), 'recruitment.approve_request', '{}'::jsonb)
      or public.has_permission(auth.uid(), public.current_org_id(), 'recruitment.manage', '{}'::jsonb)
    then (
      select count(*)::integer
      from public.recruitment_requests r
      where r.org_id = public.current_org_id()
        and r.archived_at is null
        and r.status = 'pending_review'
    )
    else 0
  end;
$$;

grant execute on function public.recruitment_requests_pending_review_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Job listings RLS
-- ---------------------------------------------------------------------------

drop policy if exists job_listings_select_org_admin on public.job_listings;
drop policy if exists job_listings_insert_org_admin on public.job_listings;
drop policy if exists job_listings_update_org_admin on public.job_listings;

create policy job_listings_select_rbac
  on public.job_listings
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
  );

create policy job_listings_insert_rbac
  on public.job_listings
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'jobs.create', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.manage', '{}'::jsonb)
    )
  );

create policy job_listings_update_rbac
  on public.job_listings
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.publish', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.archive', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.publish', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.archive', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'jobs.manage', '{}'::jsonb)
    )
  );

-- ---------------------------------------------------------------------------
-- Applications + candidate communication RLS / RPC auth
-- ---------------------------------------------------------------------------

drop policy if exists job_applications_select_org_admin on public.job_applications;
drop policy if exists job_application_notes_select_org_admin on public.job_application_notes;
drop policy if exists job_application_notes_insert_org_admin on public.job_application_notes;
drop policy if exists job_application_messages_select_org_admin on public.job_application_messages;
drop policy if exists job_application_messages_insert_org_admin on public.job_application_messages;

create policy job_applications_select_rbac
  on public.job_applications
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

create policy job_application_notes_select_rbac
  on public.job_application_notes
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.add_internal_notes', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

create policy job_application_notes_insert_rbac
  on public.job_application_notes
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.add_internal_notes', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

create policy job_application_messages_select_rbac
  on public.job_application_messages
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.notify_candidate', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

create policy job_application_messages_insert_rbac
  on public.job_application_messages
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.notify_candidate', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.move_stage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

create or replace function public.set_job_application_stage(
  p_application_id uuid,
  p_new_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = v_viewer;

  if v_org is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (
    public.has_permission(v_viewer, v_org, 'applications.move_stage', '{}'::jsonb)
    or public.has_permission(v_viewer, v_org, 'applications.manage', '{}'::jsonb)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_stage not in (
    'applied',
    'shortlisted',
    'interview_scheduled',
    'offer_sent',
    'hired',
    'rejected'
  ) then
    raise exception 'invalid stage';
  end if;

  update public.job_applications ja
  set stage = p_new_stage
  where ja.id = p_application_id
    and ja.org_id = v_org;

  if not found then
    raise exception 'application not found' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.set_job_application_stage(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Interview scheduling RLS
-- ---------------------------------------------------------------------------

drop policy if exists interview_slots_org_admin_all on public.interview_slots;
drop policy if exists interview_slots_panelist_select on public.interview_slots;
drop policy if exists interview_slot_panelists_org_admin_all on public.interview_slot_panelists;
drop policy if exists interview_slot_panelists_self_select on public.interview_slot_panelists;
drop policy if exists interview_slot_google_events_org_admin_all on public.interview_slot_google_events;

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
      )
    )
    or exists (
      select 1 from public.interview_slot_panelists p
      where p.slot_id = interview_slots.id
        and p.profile_id = auth.uid()
    )
  );

create policy interview_slots_insert_rbac
  on public.interview_slots
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'interviews.create_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.manage', '{}'::jsonb)
    )
  );

create policy interview_slots_update_rbac
  on public.interview_slots
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'interviews.book_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.complete_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.create_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'interviews.book_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.complete_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.create_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.manage', '{}'::jsonb)
    )
  );

create policy interview_slots_delete_rbac
  on public.interview_slots
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'interviews.create_slot', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'interviews.manage', '{}'::jsonb)
    )
  );

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
        )
    )
  );

create policy interview_slot_panelists_insert_rbac
  on public.interview_slot_panelists
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_panelists.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  );

create policy interview_slot_panelists_delete_rbac
  on public.interview_slot_panelists
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_panelists.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  );

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
        )
    )
  );

create policy interview_slot_google_events_insert_rbac
  on public.interview_slot_google_events
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  );

create policy interview_slot_google_events_update_rbac
  on public.interview_slot_google_events
  for update
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  )
  with check (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  );

create policy interview_slot_google_events_delete_rbac
  on public.interview_slot_google_events
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and (
          public.has_permission(auth.uid(), s.org_id, 'interviews.create_slot', '{}'::jsonb)
          or public.has_permission(auth.uid(), s.org_id, 'interviews.manage', '{}'::jsonb)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Offer templates + offers RLS
-- ---------------------------------------------------------------------------

drop policy if exists offer_letter_templates_org_admin_all on public.offer_letter_templates;
drop policy if exists application_offers_org_admin_all on public.application_offers;

create policy offer_letter_templates_select_rbac
  on public.offer_letter_templates
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy offer_letter_templates_insert_rbac
  on public.offer_letter_templates
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.generate', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy offer_letter_templates_update_rbac
  on public.offer_letter_templates
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.generate', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.generate', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy offer_letter_templates_delete_rbac
  on public.offer_letter_templates
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
  );

create policy application_offers_select_rbac
  on public.application_offers
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.view_signed_pdf', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy application_offers_insert_rbac
  on public.application_offers
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.send_esign', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy application_offers_update_rbac
  on public.application_offers
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.send_esign', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'offers.send_esign', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
    )
  );

create policy application_offers_delete_rbac
  on public.application_offers
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'offers.manage', '{}'::jsonb)
  );

-- ---------------------------------------------------------------------------
-- Storage policy hardening (CVs and signed offers)
-- ---------------------------------------------------------------------------

drop policy if exists job_application_cvs_select_org_admin on storage.objects;
drop policy if exists application_signed_offers_select_org_admin on storage.objects;

create policy job_application_cvs_select_rbac
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-application-cvs'
    and split_part(name, '/', 1) = (
      select (p.org_id)::text
      from public.profiles p
      where p.id = auth.uid()
    )
    and (
      public.has_permission(
        auth.uid(),
        (
          select p.org_id
          from public.profiles p
          where p.id = auth.uid()
        ),
        'applications.view',
        '{}'::jsonb
      )
      or public.has_permission(
        auth.uid(),
        (
          select p.org_id
          from public.profiles p
          where p.id = auth.uid()
        ),
        'applications.manage',
        '{}'::jsonb
      )
    )
  );

create policy application_signed_offers_select_rbac
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'application-signed-offers'
    and split_part(name, '/', 1) = (
      select (p.org_id)::text
      from public.profiles p
      where p.id = auth.uid()
    )
    and (
      public.has_permission(
        auth.uid(),
        (
          select p.org_id
          from public.profiles p
          where p.id = auth.uid()
        ),
        'offers.view_signed_pdf',
        '{}'::jsonb
      )
      or public.has_permission(
        auth.uid(),
        (
          select p.org_id
          from public.profiles p
          where p.id = auth.uid()
        ),
        'offers.manage',
        '{}'::jsonb
      )
    )
  );
