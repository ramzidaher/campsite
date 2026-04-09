-- Phase 9: Enforce performance.review_direct_reports on reviewer write path.

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

  if not (
    (
      v_review.reviewer_id = v_uid
      and public.has_permission(v_uid, v_org, 'performance.review_direct_reports', '{}'::jsonb)
    )
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

create or replace function public.review_goal_upsert(
  p_review_id  uuid,
  p_goal_id    uuid,
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

  if not (
    v_review.reviewee_id = v_uid
    or (
      v_review.reviewer_id = v_uid
      and public.has_permission(v_uid, v_org, 'performance.review_direct_reports', '{}'::jsonb)
    )
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
