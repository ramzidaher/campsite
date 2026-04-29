-- Persist form-level metadata used by Application forms filters.

alter table if exists public.org_application_question_sets
  add column if not exists job_title text,
  add column if not exists grade_level text,
  add column if not exists department_id uuid references public.departments (id) on delete set null;

create index if not exists org_application_question_sets_department_idx
  on public.org_application_question_sets (org_id, department_id);
