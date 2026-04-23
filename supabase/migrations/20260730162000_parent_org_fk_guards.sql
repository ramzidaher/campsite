-- Tenant integrity: parent org match guards.
-- Ensures org-scoped rows cannot reference parent records from a different org.

create or replace function public.enforce_parent_org_match()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
  v_col text;
  v_parent_table text;
  v_ref_id uuid;
  v_parent_org uuid;
  i int := 0;
begin
  v_org := new.org_id;
  if v_org is null then
    return new;
  end if;

  if tg_nargs % 2 <> 0 then
    raise exception 'enforce_parent_org_match expects pairs of (column_name, parent_table)';
  end if;

  while i < tg_nargs loop
    v_col := tg_argv[i];
    v_parent_table := tg_argv[i + 1];

    execute format('select ($1).%I::uuid', v_col) into v_ref_id using new;

    if v_ref_id is not null then
      execute format('select p.org_id from public.%I p where p.id = $1', v_parent_table)
        into v_parent_org
        using v_ref_id;

      if v_parent_org is not null and v_parent_org is distinct from v_org then
        raise exception
          'parent org mismatch on %.% -> %: parent row % belongs to org %, row org is %',
          tg_table_name,
          v_col,
          v_parent_table,
          v_ref_id,
          v_parent_org,
          v_org
          using errcode = '23514';
      end if;
    end if;

    i := i + 2;
  end loop;

  return new;
end;
$$;

comment on function public.enforce_parent_org_match() is
  'Trigger helper: validates referenced parent rows (with org_id) belong to NEW.org_id.';

-- ---------------------------------------------------------------------------
-- Core recruitment / applications
-- ---------------------------------------------------------------------------

drop trigger if exists job_applications_parent_org_match_trg on public.job_applications;
create trigger job_applications_parent_org_match_trg
before insert or update of org_id, job_listing_id, department_id, interview_slot_id
on public.job_applications
for each row
execute function public.enforce_parent_org_match(
  'job_listing_id', 'job_listings',
  'department_id', 'departments',
  'interview_slot_id', 'interview_slots'
);

drop trigger if exists application_offers_parent_org_match_trg on public.application_offers;
create trigger application_offers_parent_org_match_trg
before insert or update of org_id, job_application_id, template_id
on public.application_offers
for each row
execute function public.enforce_parent_org_match(
  'job_application_id', 'job_applications',
  'template_id', 'offer_letter_templates'
);

drop trigger if exists job_application_messages_parent_org_match_trg on public.job_application_messages;
create trigger job_application_messages_parent_org_match_trg
before insert or update of org_id, job_application_id
on public.job_application_messages
for each row
execute function public.enforce_parent_org_match('job_application_id', 'job_applications');

drop trigger if exists job_application_notes_parent_org_match_trg on public.job_application_notes;
create trigger job_application_notes_parent_org_match_trg
before insert or update of org_id, job_application_id
on public.job_application_notes
for each row
execute function public.enforce_parent_org_match('job_application_id', 'job_applications');

drop trigger if exists application_notifications_parent_org_match_trg on public.application_notifications;
create trigger application_notifications_parent_org_match_trg
before insert or update of org_id, application_id, job_listing_id
on public.application_notifications
for each row
execute function public.enforce_parent_org_match(
  'application_id', 'job_applications',
  'job_listing_id', 'job_listings'
);

drop trigger if exists recruitment_notifications_parent_org_match_trg on public.recruitment_notifications;
create trigger recruitment_notifications_parent_org_match_trg
before insert or update of org_id, request_id
on public.recruitment_notifications
for each row
execute function public.enforce_parent_org_match('request_id', 'recruitment_requests');

-- ---------------------------------------------------------------------------
-- Calendar / rota / leave / payroll
-- ---------------------------------------------------------------------------

drop trigger if exists calendar_event_attendees_parent_org_match_trg on public.calendar_event_attendees;
create trigger calendar_event_attendees_parent_org_match_trg
before insert or update of org_id, event_id
on public.calendar_event_attendees
for each row
execute function public.enforce_parent_org_match('event_id', 'calendar_events');

drop trigger if exists calendar_event_notifications_parent_org_match_trg on public.calendar_event_notifications;
create trigger calendar_event_notifications_parent_org_match_trg
before insert or update of org_id, event_id
on public.calendar_event_notifications
for each row
execute function public.enforce_parent_org_match('event_id', 'calendar_events');

drop trigger if exists attendance_events_parent_org_match_trg on public.attendance_events;
create trigger attendance_events_parent_org_match_trg
before insert or update of org_id, work_site_id
on public.attendance_events
for each row
execute function public.enforce_parent_org_match('work_site_id', 'work_sites');

drop trigger if exists leave_notifications_parent_org_match_trg on public.leave_notifications;
create trigger leave_notifications_parent_org_match_trg
before insert or update of org_id, leave_request_id, toil_credit_request_id
on public.leave_notifications
for each row
execute function public.enforce_parent_org_match(
  'leave_request_id', 'leave_requests',
  'toil_credit_request_id', 'toil_credit_requests'
);

drop trigger if exists leave_finance_notifications_parent_org_match_trg on public.leave_finance_notifications;
create trigger leave_finance_notifications_parent_org_match_trg
before insert or update of org_id, leave_request_id, encashment_request_id
on public.leave_finance_notifications
for each row
execute function public.enforce_parent_org_match(
  'leave_request_id', 'leave_requests',
  'encashment_request_id', 'leave_encashment_requests'
);

drop trigger if exists payroll_wagesheet_reviews_parent_org_match_trg on public.payroll_wagesheet_reviews;
create trigger payroll_wagesheet_reviews_parent_org_match_trg
before insert or update of org_id
on public.payroll_wagesheet_reviews
for each row
execute function public.enforce_parent_org_match();
