-- Heading-only application question blocks ("section title") for reusable forms and job screening.

alter table public.job_listing_screening_questions
  drop constraint if exists job_listing_screening_questions_question_type_check;

alter table public.job_listing_screening_questions
  add constraint job_listing_screening_questions_question_type_check
  check (
    question_type in (
      'short_text',
      'paragraph',
      'single_choice',
      'yes_no',
      'section_title'
    )
  );

alter table public.org_application_question_set_items
  drop constraint if exists org_application_question_set_items_question_type_check;

alter table public.org_application_question_set_items
  add constraint org_application_question_set_items_question_type_check
  check (
    question_type in (
      'short_text',
      'paragraph',
      'single_choice',
      'yes_no',
      'section_title'
    )
  );

-- Section titles are display-only (matches app validation / editor defaults).
alter table public.job_listing_screening_questions
  drop constraint if exists job_listing_screening_questions_section_title_rules;

alter table public.job_listing_screening_questions
  add constraint job_listing_screening_questions_section_title_rules
  check (
    question_type <> 'section_title'
    or (
      required = false
      and scoring_enabled = false
      and coalesce(scoring_scale_max, 0) = 0
      and options is null
      and is_page_break = false
    )
  );

alter table public.org_application_question_set_items
  drop constraint if exists org_application_question_set_items_section_title_rules;

alter table public.org_application_question_set_items
  add constraint org_application_question_set_items_section_title_rules
  check (
    question_type <> 'section_title'
    or (
      required = false
      and scoring_enabled = false
      and coalesce(scoring_scale_max, 0) = 0
      and options is null
      and is_page_break = false
    )
  );
