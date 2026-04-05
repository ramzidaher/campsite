-- Performance reviews: cycles, per-employee reviews, goals, manager assessments.
-- Flow: HR creates cycle → enrolls employees → employee self-assesses →
--       manager assesses + rates → review completed.

-- ---------------------------------------------------------------------------
-- Review cycles
-- ---------------------------------------------------------------------------

create table if not exists public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  type text not null default 'annual'
    check (type in ('annual', 'mid_year', 'probation', 'quarterly')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  period_start date not null,
  period_end date not null,
  self_assessment_due date,
  manager_assessment_due date,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists review_cycles_org_idx
  on public.review_cycles (org_id, status, created_at desc);

comment on table public.review_cycles is
  'A named performance review period for the org. Employees are enrolled and get individual reviews.';

-- ---------------------------------------------------------------------------
-- Per-employee reviews
-- ---------------------------------------------------------------------------

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  cycle_id uuid not null references public.review_cycles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'self_submitted', 'manager_submitted', 'completed', 'cancelled')),
  -- self-assessment
  self_assessment text,
  self_submitted_at timestamptz,
  -- manager assessment
  manager_assessment text,
  overall_rating text
    check (overall_rating is null or overall_rating in (
      'exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory'
    )),
  manager_submitted_at timestamptz,
  -- sign-off
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, reviewee_id)
);

create index if not exists performance_reviews_cycle_idx
  on public.performance_reviews (cycle_id, status);

create index if not exists performance_reviews_reviewee_idx
  on public.performance_reviews (reviewee_id, created_at desc);

create index if not exists performance_reviews_reviewer_idx
  on public.performance_reviews (reviewer_id, status);

comment on table public.performance_reviews is
  'One review per employee per cycle. Tracks self-assessment, manager assessment, and overall rating.';

-- ---------------------------------------------------------------------------
-- Goals (per review)
-- ---------------------------------------------------------------------------

create table if not exists public.review_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  review_id uuid not null references public.performance_reviews (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'in_progress'
    check (status in ('not_started', 'in_progress', 'completed', 'carried_forward')),
  rating text
    check (rating is null or rating in ('exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory')),
  set_by text not null default 'employee'
    check (set_by in ('employee', 'manager')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists review_goals_review_idx
  on public.review_goals (review_id, sort_order);

comment on table public.review_goals is
  'Goals attached to a performance review. Can be added by the employee or their manager.';

-- ---------------------------------------------------------------------------
-- Timestamps triggers
-- ---------------------------------------------------------------------------

create or replace function public.performance_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists review_cycles_updated_at_trg on public.review_cycles;
create trigger review_cycles_updated_at_trg
  before update on public.review_cycles
  for each row execute procedure public.performance_touch_updated_at();

drop trigger if exists performance_reviews_updated_at_trg on public.performance_reviews;
create trigger performance_reviews_updated_at_trg
  before update on public.performance_reviews
  for each row execute procedure public.performance_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.review_cycles enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.review_goals enable row level security;

-- Cycles: HR managers can manage; others can read active cycles they have a review in
drop policy if exists review_cycles_manage on public.review_cycles;
create policy review_cycles_manage
  on public.review_cycles for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.manage_cycles', '{}'::jsonb)
  );

drop policy if exists review_cycles_read_enrolled on public.review_cycles;
create policy review_cycles_read_enrolled
  on public.review_cycles for select to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.performance_reviews pr
      where pr.cycle_id = id
        and (pr.reviewee_id = auth.uid() or pr.reviewer_id = auth.uid())
    )
  );

-- Reviews: HR, reviewer, or reviewee can read; writes via RPC
drop policy if exists performance_reviews_read_manage on public.performance_reviews;
create policy performance_reviews_read_manage
  on public.performance_reviews for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.view_reports', '{}'::jsonb)
  );

drop policy if exists performance_reviews_read_own on public.performance_reviews;
create policy performance_reviews_read_own
  on public.performance_reviews for select to authenticated
  using (
    org_id = public.current_org_id()
    and (reviewee_id = auth.uid() or reviewer_id = auth.uid())
  );

-- Goals: same access as their review
drop policy if exists review_goals_read_manage on public.review_goals;
create policy review_goals_read_manage
  on public.review_goals for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'performance.view_reports', '{}'::jsonb)
  );

drop policy if exists review_goals_read_own on public.review_goals;
create policy review_goals_read_own
  on public.review_goals for select to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.performance_reviews pr
      where pr.id = review_id
        and (pr.reviewee_id = auth.uid() or pr.reviewer_id = auth.uid())
    )
  );

-- Goal inserts/updates via RPC (security definer)
drop policy if exists review_goals_write on public.review_goals;
create policy review_goals_write
  on public.review_goals for all to authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- RPC: enroll employees in a cycle
-- ---------------------------------------------------------------------------

create or replace function public.review_cycle_enroll(
  p_cycle_id uuid,
  p_user_ids uuid[]
)
returns integer   -- number of rows inserted
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_count integer := 0;
  v_uid_item uuid;
  v_reviewer uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'performance.manage_cycles', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (select 1 from public.review_cycles where id = p_cycle_id and org_id = v_org) then
    raise exception 'cycle not found';
  end if;

  foreach v_uid_item in array p_user_ids loop
    -- resolve reviewer = reports_to_user_id, fall back null
    select reports_to_user_id into v_reviewer
    from public.profiles where id = v_uid_item and org_id = v_org;

    insert into public.performance_reviews (
      org_id, cycle_id, reviewee_id, reviewer_id
    ) values (
      v_org, p_cycle_id, v_uid_item, v_reviewer
    )
    on conflict (cycle_id, reviewee_id) do nothing;

    if found then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: employee submits self-assessment
-- ---------------------------------------------------------------------------

create or replace function public.review_self_submit(
  p_review_id uuid,
  p_self_assessment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_review public.performance_reviews;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_review from public.performance_reviews where id = p_review_id and org_id = v_org;
  if v_review.id is null then raise exception 'review not found'; end if;
  if v_review.reviewee_id <> v_uid then raise exception 'not your review'; end if;
  if v_review.status not in ('pending', 'self_submitted') then
    raise exception 'review cannot be updated at this stage';
  end if;

  update public.performance_reviews set
    self_assessment = nullif(trim(coalesce(p_self_assessment, '')), ''),
    self_submitted_at = now(),
    status = 'self_submitted'
  where id = p_review_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: manager submits assessment + overall rating
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
  v_uid uuid := auth.uid();
  v_org uuid;
  v_review public.performance_reviews;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_review from public.performance_reviews where id = p_review_id and org_id = v_org;
  if v_review.id is null then raise exception 'review not found'; end if;

  -- allowed if: HR manager or the designated reviewer
  if not (
    public.has_permission(v_uid, v_org, 'performance.view_reports', '{}'::jsonb)
    or v_review.reviewer_id = v_uid
  ) then
    raise exception 'not allowed';
  end if;

  if v_review.status = 'completed' or v_review.status = 'cancelled' then
    raise exception 'review already finalised';
  end if;

  if p_overall_rating not in ('exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory') then
    raise exception 'invalid overall_rating';
  end if;

  update public.performance_reviews set
    manager_assessment = nullif(trim(coalesce(p_manager_assessment, '')), ''),
    overall_rating = p_overall_rating,
    manager_submitted_at = now(),
    status = 'completed',
    completed_at = now()
  where id = p_review_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: upsert a goal (employee or manager)
-- ---------------------------------------------------------------------------

create or replace function public.review_goal_upsert(
  p_review_id uuid,
  p_goal_id uuid,      -- null = insert new
  p_title text,
  p_description text,
  p_status text,
  p_rating text,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_review public.performance_reviews;
  v_goal_id uuid;
  v_set_by text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  select * into v_review from public.performance_reviews where id = p_review_id and org_id = v_org;
  if v_review.id is null then raise exception 'review not found'; end if;

  -- only reviewee, reviewer, or HR manager
  if not (
    v_review.reviewee_id = v_uid
    or v_review.reviewer_id = v_uid
    or public.has_permission(v_uid, v_org, 'performance.view_reports', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  if v_review.status = 'completed' or v_review.status = 'cancelled' then
    raise exception 'review is finalised';
  end if;

  -- validate enums
  if p_status not in ('not_started', 'in_progress', 'completed', 'carried_forward') then
    raise exception 'invalid status';
  end if;
  if p_rating is not null and p_rating not in ('exceptional', 'strong', 'meets_expectations', 'developing', 'unsatisfactory') then
    raise exception 'invalid rating';
  end if;

  v_set_by := case when v_review.reviewer_id = v_uid then 'manager' else 'employee' end;

  if p_goal_id is null then
    insert into public.review_goals (
      org_id, review_id, title, description, status, rating, set_by, sort_order
    ) values (
      v_org, p_review_id,
      trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
      p_status, p_rating, v_set_by, coalesce(p_sort_order, 0)
    )
    returning id into v_goal_id;
  else
    update public.review_goals set
      title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      status = p_status,
      rating = p_rating,
      sort_order = coalesce(p_sort_order, sort_order)
    where id = p_goal_id and review_id = p_review_id and org_id = v_org;
    v_goal_id := p_goal_id;
  end if;

  return v_goal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get all reviews for a cycle (HR view)
-- ---------------------------------------------------------------------------

create or replace function public.review_cycle_reviews(p_cycle_id uuid)
returns table (
  review_id uuid,
  reviewee_id uuid,
  reviewee_name text,
  reviewee_email text,
  reviewer_id uuid,
  reviewer_name text,
  status text,
  overall_rating text,
  self_submitted_at timestamptz,
  manager_submitted_at timestamptz,
  completed_at timestamptz,
  goal_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'performance.manage_cycles', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (select 1 from public.review_cycles where id = p_cycle_id and org_id = v_org) then
    raise exception 'cycle not found';
  end if;

  return query
  select
    pr.id            as review_id,
    pr.reviewee_id,
    e.full_name::text as reviewee_name,
    e.email::text     as reviewee_email,
    pr.reviewer_id,
    m.full_name::text as reviewer_name,
    pr.status::text,
    pr.overall_rating::text,
    pr.self_submitted_at,
    pr.manager_submitted_at,
    pr.completed_at,
    count(g.id)      as goal_count
  from public.performance_reviews pr
  join public.profiles e on e.id = pr.reviewee_id
  left join public.profiles m on m.id = pr.reviewer_id
  left join public.review_goals g on g.review_id = pr.id
  where pr.cycle_id = p_cycle_id
    and pr.org_id = v_org
  group by pr.id, e.full_name, e.email, m.full_name
  order by e.full_name;
end;
$$;
