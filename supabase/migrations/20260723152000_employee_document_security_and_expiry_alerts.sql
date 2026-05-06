-- Tighten employee document MIME/bucket rules and add ID expiry reminders.

-- ---------------------------------------------------------------------------
-- 1) Stronger DB constraints for sensitive document kinds
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_hr_documents'::regclass
      and conname = 'employee_hr_documents_bucket_kind_check'
  ) then
    alter table public.employee_hr_documents
      add constraint employee_hr_documents_bucket_kind_check
      check (
        (document_kind = 'employee_photo' and bucket_id = 'employee-photos')
        or (document_kind = 'id_document' and bucket_id = 'employee-id-documents')
        or (document_kind = 'supporting_document' and bucket_id = 'employee-hr-documents')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_hr_documents'::regclass
      and conname = 'employee_hr_documents_mime_policy_check'
  ) then
    alter table public.employee_hr_documents
      add constraint employee_hr_documents_mime_policy_check
      check (
        (
          document_kind = 'employee_photo'
          and lower(split_part(coalesce(mime_type, ''), ';', 1)) like 'image/%'
        )
        or (
          document_kind = 'id_document'
          and (
            lower(split_part(coalesce(mime_type, ''), ';', 1)) = 'application/pdf'
            or lower(split_part(coalesce(mime_type, ''), ';', 1)) like 'image/%'
          )
        )
        or (
          document_kind = 'supporting_document'
          and lower(split_part(coalesce(mime_type, ''), ';', 1)) in (
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          )
        )
        or (
          document_kind = 'supporting_document'
          and lower(split_part(coalesce(mime_type, ''), ';', 1)) like 'image/%'
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Extend HR metric notifications for ID expiry alerts
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.hr_metric_notifications'::regclass
      and conname = 'hr_metric_notifications_metric_kind_check'
  ) then
    alter table public.hr_metric_notifications
      drop constraint hr_metric_notifications_metric_kind_check;
  end if;
end $$;

alter table public.hr_metric_notifications
  add constraint hr_metric_notifications_metric_kind_check
  check (metric_kind in (
    'bradford_threshold',
    'working_hours_excess',
    'diversity_quota',
    'probation_review_due',
    'missing_hr_record',
    'review_cycle_manager_overdue',
    'id_document_expiry'
  ));

create or replace function public.hr_id_document_expiry_run_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := to_char(current_date, 'IYYY') || '-' || to_char(current_date, 'IW');
  rec record;
begin
  for rec in
    select
      d.user_id,
      d.file_name,
      d.expires_on,
      p.full_name,
      p.reports_to_user_id,
      case
        when d.expires_on < current_date then 'critical'
        else 'warning'
      end as sev
    from public.employee_hr_documents d
    join public.profiles p
      on p.id = d.user_id
     and p.org_id = d.org_id
     and p.status = 'active'
    where d.org_id = p_org_id
      and d.document_kind = 'id_document'
      and d.is_current = true
      and d.expires_on is not null
      and d.expires_on <= current_date + interval '30 days'
  loop
    insert into public.hr_metric_notifications (
      org_id,
      recipient_id,
      metric_kind,
      severity,
      title,
      body,
      payload,
      subject_user_id,
      dedupe_key
    )
    select
      p_org_id,
      recipients.uid,
      'id_document_expiry',
      rec.sev,
      'ID document expiry alert',
      case
        when rec.expires_on < current_date
          then format('%s  current ID document "%s" expired on %s.', rec.full_name, rec.file_name, rec.expires_on::text)
        else format('%s  current ID document "%s" expires on %s.', rec.full_name, rec.file_name, rec.expires_on::text)
      end,
      jsonb_build_object(
        'file_name', rec.file_name,
        'expires_on', rec.expires_on,
        'status', case when rec.expires_on < current_date then 'expired' else 'due_soon' end
      ),
      rec.user_id,
      'id_doc_expiry:' || p_org_id::text || ':' || rec.user_id::text || ':' || rec.expires_on::text || ':' || v_week
    from (
      select distinct uid
      from (
        select rec.reports_to_user_id as uid
        union all
        select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
      ) s
      where uid is not null
    ) recipients
    on conflict (recipient_id, dedupe_key) do nothing;
  end loop;
end;
$$;

revoke all on function public.hr_id_document_expiry_run_org(uuid) from public;
grant execute on function public.hr_id_document_expiry_run_org(uuid) to service_role, postgres;

create or replace function public.hr_id_document_expiry_run_all_orgs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id as org_id from public.organisations where is_active = true
  loop
    perform public.hr_id_document_expiry_run_org(r.org_id);
  end loop;
end;
$$;

revoke all on function public.hr_id_document_expiry_run_all_orgs() from public;
grant execute on function public.hr_id_document_expiry_run_all_orgs() to service_role, postgres;

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id
    from cron.job
    where jobname = 'hr-id-doc-expiry-alerts'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'hr-id-doc-expiry-alerts',
      '20 6 * * *',
      $job$select public.hr_id_document_expiry_run_all_orgs();$job$
    );
  end if;
end $$;
