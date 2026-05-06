-- Phase 1: Critical HR bug fixes
-- 1. review_cycles.created_by  add auth.uid() default so direct INSERT doesn't crash on NOT NULL
-- 2. review_manager_submit  fix permission gate: view_reports (read) wrongly used as write gate
-- 3. review_goal_upsert     same permission fix
-- 4. offer_letter_status    add superseded to check constraint + trigger to keep it in sync

-- ---------------------------------------------------------------------------
-- 1. review_cycles: default created_by to auth.uid()
-- ---------------------------------------------------------------------------

alter table public.review_cycles
  alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 2. Fix review_manager_submit: replace performance.view_reports gate with
--    performance.manage_cycles for the HR admin override path.
--    The assigned reviewer (reviewer_id = caller) gate is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.review_manager_submit(
  p_review_id uuid,
  p_manager_assessment text,
  p_overall_rating text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_review public.performance_reviews;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_review
    from public.performance_reviews
   where id = p_review_id and org_id = v_org;
  if v_review.id is null then raise exception 'review not found'; end if;

  -- allowed if: the designated reviewer OR an HR manager with manage_cycles (not just view_reports)
  if not (
    v_review.reviewer_id = v_uid
    or public.has_permission(v_uid, v_org, 'performance.manage_cycles', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  if v_review.status in ('completed', 'cancelled') then
    raise exception 'review already finalised';
  end if;

  if p_overall_rating not in (
    'exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory'
  ) then
    raise exception 'invalid overall_rating';
  end if;

  update public.performance_reviews set
    manager_assessment  = nullif(trim(coalesce(p_manager_assessment, '')), ''),
    overall_rating      = p_overall_rating,
    manager_submitted_at = now(),
    status              = 'completed',
    completed_at        = now()
  where id = p_review_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Fix review_goal_upsert: same permission fix  HR override must use
--    performance.manage_cycles, not the read-only performance.view_reports.
-- ---------------------------------------------------------------------------

create or replace function public.review_goal_upsert(
  p_review_id  uuid,
  p_goal_id    uuid,      -- null = insert new
  p_title      text,
  p_description text,
  p_status     text,
  p_rating     text,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org    uuid;
  v_review public.performance_reviews;
  v_goal_id uuid;
  v_set_by  text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_review
    from public.performance_reviews
   where id = p_review_id and org_id = v_org;
  if v_review.id is null then raise exception 'review not found'; end if;

  -- allowed if: reviewee, assigned reviewer, or HR admin with manage_cycles
  if not (
    v_review.reviewee_id = v_uid
    or v_review.reviewer_id = v_uid
    or public.has_permission(v_uid, v_org, 'performance.manage_cycles', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  if v_review.status in ('completed', 'cancelled') then
    raise exception 'review is finalised';
  end if;

  if p_status not in ('not_started', 'in_progress', 'completed', 'carried_forward') then
    raise exception 'invalid status';
  end if;
  if p_rating is not null and p_rating not in (
    'exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory'
  ) then
    raise exception 'invalid rating';
  end if;

  v_set_by := case
    when v_review.reviewer_id = v_uid then 'manager'
    else 'employee'
  end;

  if p_goal_id is null then
    insert into public.review_goals (
      org_id, review_id, title, description, status, rating, set_by, sort_order
    ) values (
      v_org, p_review_id,
      trim(p_title),
      nullif(trim(coalesce(p_description, '')), ''),
      p_status, p_rating, v_set_by, coalesce(p_sort_order, 0)
    )
    returning id into v_goal_id;
  else
    update public.review_goals set
      title       = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      status      = p_status,
      rating      = p_rating,
      sort_order  = coalesce(p_sort_order, sort_order)
    where id = p_goal_id
      and review_id = p_review_id
      and org_id = v_org;
    v_goal_id := p_goal_id;
  end if;

  return v_goal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. offer_letter_status sync
--    a) Extend check constraint to include 'superseded' (application_offers uses it)
--    b) Trigger: whenever application_offers.status changes, keep
--       job_applications.offer_letter_status in sync
-- ---------------------------------------------------------------------------

-- Drop old check constraint and re-add with superseded included
alter table public.job_applications
  drop constraint if exists job_applications_offer_letter_status_check;

alter table public.job_applications
  add constraint job_applications_offer_letter_status_check
  check (offer_letter_status is null or offer_letter_status in (
    'sent', 'signed', 'declined', 'superseded'
  ));

-- Trigger function: sync the denormalised status column
create or replace function public.sync_offer_letter_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_applications
     set offer_letter_status = NEW.status
   where id = NEW.job_application_id;
  return NEW;
end;
$$;

-- Create trigger on application_offers (fires on insert and whenever status changes)
drop trigger if exists offer_letter_status_sync_trg on public.application_offers;
create trigger offer_letter_status_sync_trg
  after insert or update of status
  on public.application_offers
  for each row
  execute procedure public.sync_offer_letter_status();

-- Back-fill any existing offers so the column is accurate immediately
update public.job_applications ja
   set offer_letter_status = (
     select ao.status
       from public.application_offers ao
      where ao.job_application_id = ja.id
      order by ao.created_at desc
      limit 1
   )
 where exists (
   select 1 from public.application_offers ao
    where ao.job_application_id = ja.id
 );
