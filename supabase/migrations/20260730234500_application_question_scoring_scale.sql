-- Per-question scoring scale for reviewer scoring (0..5).

alter table if exists public.job_listing_screening_questions
  add column if not exists scoring_scale_max smallint not null default 5;

alter table if exists public.org_application_question_set_items
  add column if not exists scoring_scale_max smallint not null default 5;

alter table public.job_listing_screening_questions
  drop constraint if exists job_listing_screening_questions_scoring_scale_max_range;
alter table public.job_listing_screening_questions
  add constraint job_listing_screening_questions_scoring_scale_max_range
  check (scoring_scale_max >= 0 and scoring_scale_max <= 5);

alter table public.org_application_question_set_items
  drop constraint if exists org_application_question_set_items_scoring_scale_max_range;
alter table public.org_application_question_set_items
  add constraint org_application_question_set_items_scoring_scale_max_range
  check (scoring_scale_max >= 0 and scoring_scale_max <= 5);

-- Keep page-break rows non-scorable.
alter table public.job_listing_screening_questions
  drop constraint if exists job_listing_screening_questions_page_break_rules;
alter table public.job_listing_screening_questions
  add constraint job_listing_screening_questions_page_break_rules
  check (
    is_page_break = false
    or (
      required = false
      and scoring_enabled = false
      and scoring_scale_max = 0
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
      and scoring_scale_max = 0
      and options is null
    )
  );

update public.job_listing_screening_questions
set scoring_scale_max = case when scoring_enabled then 5 else 0 end
where scoring_scale_max is distinct from case when scoring_enabled then 5 else 0 end;

update public.org_application_question_set_items
set scoring_scale_max = case when scoring_enabled then 5 else 0 end
where scoring_scale_max is distinct from case when scoring_enabled then 5 else 0 end;
