-- Application question metadata for reusable forms and job screening questions.
-- Adds page-break and reviewer controls inspired by legacy ATS flows.

alter table if exists public.job_listing_screening_questions
  add column if not exists is_page_break boolean not null default false,
  add column if not exists scoring_enabled boolean not null default true,
  add column if not exists initially_hidden boolean not null default false,
  add column if not exists locked boolean not null default false;

alter table if exists public.org_application_question_set_items
  add column if not exists is_page_break boolean not null default false,
  add column if not exists scoring_enabled boolean not null default true,
  add column if not exists initially_hidden boolean not null default false,
  add column if not exists locked boolean not null default false;

alter table public.job_listing_screening_questions
  drop constraint if exists job_listing_screening_questions_page_break_rules;
alter table public.job_listing_screening_questions
  add constraint job_listing_screening_questions_page_break_rules
  check (
    is_page_break = false
    or (
      required = false
      and scoring_enabled = false
      and options is null
    )
  );

alter table public.org_application_question_set_items
  drop constraint if exists org_application_question_set_items_page_break_rules;
alter table public.org_application_question_set_items
  add constraint org_application_question_set_items_page_break_rules
  check (
    is_page_break = false
    or (
      required = false
      and scoring_enabled = false
      and options is null
    )
  );

drop function if exists public.public_job_listing_screening_questions(text, text);

create function public.public_job_listing_screening_questions(
  p_org_slug text,
  p_job_slug text
)
returns table (
  id uuid,
  question_type text,
  prompt text,
  help_text text,
  required boolean,
  is_page_break boolean,
  scoring_enabled boolean,
  initially_hidden boolean,
  locked boolean,
  options jsonb,
  max_length int,
  sort_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    q.id,
    q.question_type,
    q.prompt,
    q.help_text,
    q.required,
    q.is_page_break,
    q.scoring_enabled,
    q.initially_hidden,
    q.locked,
    q.options,
    q.max_length,
    q.sort_order
  from public.job_listing_screening_questions q
  join public.job_listings jl on jl.id = q.job_listing_id
  join public.organisations o
    on o.id = jl.org_id
    and o.is_active = true
    and o.slug = nullif(trim(p_org_slug), '')
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live'
    and (
      jl.applications_close_at is null
      or now() <= jl.applications_close_at
    )
  order by q.sort_order, q.id;
$$;

grant execute on function public.public_job_listing_screening_questions(text, text) to anon, authenticated;
