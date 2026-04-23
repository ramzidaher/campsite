-- Enforce immutability on audit/event tables.
-- Policy: INSERT allowed, UPDATE/DELETE blocked.

create or replace function public.prevent_audit_mutation_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Audit/event records are immutable (% on %)', tg_op, tg_table_name
    using errcode = '55000';
end;
$$;

comment on function public.prevent_audit_mutation_trg_fn() is
  'Blocks UPDATE/DELETE on immutable audit/event tables.';

-- Core audit/event tables
drop trigger if exists platform_audit_events_immutable_trg on public.platform_audit_events;
create trigger platform_audit_events_immutable_trg
before update or delete on public.platform_audit_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists audit_role_events_immutable_trg on public.audit_role_events;
create trigger audit_role_events_immutable_trg
before update or delete on public.audit_role_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists privacy_erasure_audit_events_immutable_trg on public.privacy_erasure_audit_events;
create trigger privacy_erasure_audit_events_immutable_trg
before update or delete on public.privacy_erasure_audit_events
for each row execute function public.prevent_audit_mutation_trg_fn();

-- HR audit/event tables
drop trigger if exists employee_hr_record_events_immutable_trg on public.employee_hr_record_events;
create trigger employee_hr_record_events_immutable_trg
before update or delete on public.employee_hr_record_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists employee_bank_detail_events_immutable_trg on public.employee_bank_detail_events;
create trigger employee_bank_detail_events_immutable_trg
before update or delete on public.employee_bank_detail_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists employee_uk_tax_detail_events_immutable_trg on public.employee_uk_tax_detail_events;
create trigger employee_uk_tax_detail_events_immutable_trg
before update or delete on public.employee_uk_tax_detail_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists employee_medical_note_events_immutable_trg on public.employee_medical_note_events;
create trigger employee_medical_note_events_immutable_trg
before update or delete on public.employee_medical_note_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists employee_case_record_events_immutable_trg on public.employee_case_record_events;
create trigger employee_case_record_events_immutable_trg
before update or delete on public.employee_case_record_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists employee_record_export_events_immutable_trg on public.employee_record_export_events;
create trigger employee_record_export_events_immutable_trg
before update or delete on public.employee_record_export_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists hr_custom_field_events_immutable_trg on public.hr_custom_field_events;
create trigger hr_custom_field_events_immutable_trg
before update or delete on public.hr_custom_field_events
for each row execute function public.prevent_audit_mutation_trg_fn();

drop trigger if exists recruitment_request_status_events_immutable_trg on public.recruitment_request_status_events;
create trigger recruitment_request_status_events_immutable_trg
before update or delete on public.recruitment_request_status_events
for each row execute function public.prevent_audit_mutation_trg_fn();
