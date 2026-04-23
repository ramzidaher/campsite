-- Parent-org guard coverage phase 2:
-- Extend org_id parent-reference checks to remaining org-scoped link tables.

-- ---------------------------------------------------------------------------
-- Recruitment / screening / metrics
-- ---------------------------------------------------------------------------

drop trigger if exists job_application_screening_answers_parent_org_match_trg on public.job_application_screening_answers;
create trigger job_application_screening_answers_parent_org_match_trg
before insert or update of org_id, job_application_id
on public.job_application_screening_answers
for each row
execute function public.enforce_parent_org_match(
  'job_application_id', 'job_applications'
);

drop trigger if exists job_application_screening_scores_parent_org_match_trg on public.job_application_screening_scores;
create trigger job_application_screening_scores_parent_org_match_trg
before insert or update of org_id, screening_answer_id
on public.job_application_screening_scores
for each row
execute function public.enforce_parent_org_match(
  'screening_answer_id', 'job_application_screening_answers'
);

drop trigger if exists job_listing_screening_questions_parent_org_match_trg on public.job_listing_screening_questions;
create trigger job_listing_screening_questions_parent_org_match_trg
before insert or update of org_id, job_listing_id
on public.job_listing_screening_questions
for each row
execute function public.enforce_parent_org_match(
  'job_listing_id', 'job_listings'
);

drop trigger if exists job_listing_public_metrics_parent_org_match_trg on public.job_listing_public_metrics;
create trigger job_listing_public_metrics_parent_org_match_trg
before insert or update of org_id, job_listing_id
on public.job_listing_public_metrics
for each row
execute function public.enforce_parent_org_match(
  'job_listing_id', 'job_listings'
);

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

drop trigger if exists onboarding_runs_parent_org_match_trg on public.onboarding_runs;
create trigger onboarding_runs_parent_org_match_trg
before insert or update of org_id, template_id, offer_id
on public.onboarding_runs
for each row
execute function public.enforce_parent_org_match(
  'template_id', 'onboarding_templates',
  'offer_id', 'application_offers'
);

drop trigger if exists onboarding_template_tasks_parent_org_match_trg on public.onboarding_template_tasks;
create trigger onboarding_template_tasks_parent_org_match_trg
before insert or update of org_id, template_id
on public.onboarding_template_tasks
for each row
execute function public.enforce_parent_org_match(
  'template_id', 'onboarding_templates'
);

drop trigger if exists onboarding_run_tasks_parent_org_match_trg on public.onboarding_run_tasks;
create trigger onboarding_run_tasks_parent_org_match_trg
before insert or update of org_id, run_id, template_task_id
on public.onboarding_run_tasks
for each row
execute function public.enforce_parent_org_match(
  'run_id', 'onboarding_runs',
  'template_task_id', 'onboarding_template_tasks'
);

-- ---------------------------------------------------------------------------
-- Reviews / custom question sets / payroll
-- ---------------------------------------------------------------------------

drop trigger if exists performance_reviews_parent_org_match_trg on public.performance_reviews;
create trigger performance_reviews_parent_org_match_trg
before insert or update of org_id, cycle_id
on public.performance_reviews
for each row
execute function public.enforce_parent_org_match(
  'cycle_id', 'review_cycles'
);

drop trigger if exists review_goals_parent_org_match_trg on public.review_goals;
create trigger review_goals_parent_org_match_trg
before insert or update of org_id, review_id
on public.review_goals
for each row
execute function public.enforce_parent_org_match(
  'review_id', 'performance_reviews'
);

drop trigger if exists org_application_question_set_items_parent_org_match_trg on public.org_application_question_set_items;
create trigger org_application_question_set_items_parent_org_match_trg
before insert or update of org_id, set_id
on public.org_application_question_set_items
for each row
execute function public.enforce_parent_org_match(
  'set_id', 'org_application_question_sets'
);

drop trigger if exists wagesheet_lines_parent_org_match_trg on public.wagesheet_lines;
create trigger wagesheet_lines_parent_org_match_trg
before insert or update of org_id
on public.wagesheet_lines
for each row
execute function public.enforce_parent_org_match();
