-- Tenant integrity guardrails:
-- Ensure profile/user reference columns on org-scoped tables point to users
-- that are members of the same org via user_org_memberships.
--
-- Why membership-based (not profiles.org_id):
-- profiles.org_id is active-org context and can change for multi-org users.

create or replace function public.enforce_org_membership_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
  v_col text;
  v_ref_user uuid;
begin
  v_org := new.org_id;
  if v_org is null then
    return new;
  end if;

  foreach v_col in array tg_argv loop
    execute format('select ($1).%I::uuid', v_col) into v_ref_user using new;

    if v_ref_user is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.user_org_memberships m
      where m.user_id = v_ref_user
        and m.org_id = v_org
    ) then
      raise exception
        'org membership violation on %.%: user % is not a member of org %',
        tg_table_name,
        v_col,
        v_ref_user,
        v_org
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.enforce_org_membership_refs() is
  'Trigger helper: validates that referenced users in specified columns are members of row org_id via user_org_memberships.';

-- ---------------------------------------------------------------------------
-- Attach guards to high-risk org-scoped tables
-- ---------------------------------------------------------------------------

drop trigger if exists leave_requests_org_membership_refs_trg on public.leave_requests;
create trigger leave_requests_org_membership_refs_trg
before insert or update of org_id, requester_id, decided_by
on public.leave_requests
for each row
execute function public.enforce_org_membership_refs('requester_id', 'decided_by');

drop trigger if exists weekly_timesheets_org_membership_refs_trg on public.weekly_timesheets;
create trigger weekly_timesheets_org_membership_refs_trg
before insert or update of org_id, user_id, submitted_by, decided_by
on public.weekly_timesheets
for each row
execute function public.enforce_org_membership_refs('user_id', 'submitted_by', 'decided_by');

drop trigger if exists sickness_absences_org_membership_refs_trg on public.sickness_absences;
create trigger sickness_absences_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, voided_by
on public.sickness_absences
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'voided_by');

drop trigger if exists attendance_events_org_membership_refs_trg on public.attendance_events;
create trigger attendance_events_org_membership_refs_trg
before insert or update of org_id, user_id, created_by
on public.attendance_events
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by');

drop trigger if exists employee_hr_records_org_membership_refs_trg on public.employee_hr_records;
create trigger employee_hr_records_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by, probation_check_completed_by
on public.employee_hr_records
for each row
execute function public.enforce_org_membership_refs(
  'user_id',
  'created_by',
  'updated_by',
  'probation_check_completed_by'
);

drop trigger if exists job_application_messages_org_membership_refs_trg on public.job_application_messages;
create trigger job_application_messages_org_membership_refs_trg
before insert or update of org_id, created_by
on public.job_application_messages
for each row
execute function public.enforce_org_membership_refs('created_by');

drop trigger if exists job_application_notes_org_membership_refs_trg on public.job_application_notes;
create trigger job_application_notes_org_membership_refs_trg
before insert or update of org_id, created_by
on public.job_application_notes
for each row
execute function public.enforce_org_membership_refs('created_by');

drop trigger if exists application_notifications_org_membership_refs_trg on public.application_notifications;
create trigger application_notifications_org_membership_refs_trg
before insert or update of org_id, recipient_id
on public.application_notifications
for each row
execute function public.enforce_org_membership_refs('recipient_id');

drop trigger if exists recruitment_notifications_org_membership_refs_trg on public.recruitment_notifications;
create trigger recruitment_notifications_org_membership_refs_trg
before insert or update of org_id, recipient_id
on public.recruitment_notifications
for each row
execute function public.enforce_org_membership_refs('recipient_id');

drop trigger if exists leave_notifications_org_membership_refs_trg on public.leave_notifications;
create trigger leave_notifications_org_membership_refs_trg
before insert or update of org_id, recipient_id
on public.leave_notifications
for each row
execute function public.enforce_org_membership_refs('recipient_id');

drop trigger if exists leave_finance_notifications_org_membership_refs_trg on public.leave_finance_notifications;
create trigger leave_finance_notifications_org_membership_refs_trg
before insert or update of org_id, recipient_id, actor_user_id, subject_user_id
on public.leave_finance_notifications
for each row
execute function public.enforce_org_membership_refs('recipient_id', 'actor_user_id', 'subject_user_id');
