-- Screening questions per job, applicant answers (snapshots), multi-reviewer scores,
-- optional applications_close_at, public RPC for questions, submit + scoring RPCs.

-- ---------------------------------------------------------------------------
-- job_listings: optional application deadline
-- ---------------------------------------------------------------------------

alter table public.job_listings
  add column if not exists applications_close_at timestamptz;

comment on column public.job_listings.applications_close_at is
  'When set and in the past, submit_job_application rejects new submissions.';

create index if not exists job_listings_live_close_idx
  on public.job_listings (org_id, status, applications_close_at)
  where status = 'live' and applications_close_at is not null;

-- ---------------------------------------------------------------------------
-- job_listing_screening_questions
-- ---------------------------------------------------------------------------

create table if not exists public.job_listing_screening_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_listing_id uuid not null references public.job_listings (id) on delete cascade,
  sort_order int not null default 0,
  question_type text not null
    check (question_type in ('short_text', 'paragraph', 'single_choice', 'yes_no')),
  prompt text not null,
  help_text text,
  required boolean not null default true,
  options jsonb,
  max_length int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_listing_screening_questions_single_choice_options
    check (
      question_type <> 'single_choice'
      or (
        options is not null
        and jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) >= 1
      )
    ),
  constraint job_listing_screening_questions_non_choice_no_options
    check (
      question_type = 'single_choice'
      or options is null
    )
);

create index if not exists job_listing_screening_questions_job_sort_idx
  on public.job_listing_screening_questions (job_listing_id, sort_order, id);

create or replace function public.job_listing_screening_questions_set_org()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.org_id := (
    select jl.org_id
    from public.job_listings jl
    where jl.id = new.job_listing_id
  );
  return new;
end;
$$;

drop trigger if exists job_listing_screening_questions_set_org_trg
  on public.job_listing_screening_questions;
create trigger job_listing_screening_questions_set_org_trg
  before insert or update of job_listing_id on public.job_listing_screening_questions
  for each row
  execute function public.job_listing_screening_questions_set_org();

create or replace function public.job_listing_screening_questions_touch_updated_at()
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

drop trigger if exists job_listing_screening_questions_updated_at_trg
  on public.job_listing_screening_questions;
create trigger job_listing_screening_questions_updated_at_trg
  before update on public.job_listing_screening_questions
  for each row
  execute function public.job_listing_screening_questions_touch_updated_at();

alter table public.job_listing_screening_questions enable row level security;

drop policy if exists job_listing_screening_questions_select_rbac
  on public.job_listing_screening_questions;
create policy job_listing_screening_questions_select_rbac
  on public.job_listing_screening_questions
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
  );

drop policy if exists job_listing_screening_questions_insert_rbac
  on public.job_listing_screening_questions;
create policy job_listing_screening_questions_insert_rbac
  on public.job_listing_screening_questions
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists job_listing_screening_questions_update_rbac
  on public.job_listing_screening_questions;
create policy job_listing_screening_questions_update_rbac
  on public.job_listing_screening_questions
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists job_listing_screening_questions_delete_rbac
  on public.job_listing_screening_questions;
create policy job_listing_screening_questions_delete_rbac
  on public.job_listing_screening_questions
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

-- ---------------------------------------------------------------------------
-- job_application_screening_answers (snapshots on submit)
-- ---------------------------------------------------------------------------

create table if not exists public.job_application_screening_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_application_id uuid not null references public.job_applications (id) on delete cascade,
  source_question_id uuid references public.job_listing_screening_questions (id) on delete set null,
  prompt_snapshot text not null,
  type_snapshot text not null
    check (type_snapshot in ('short_text', 'paragraph', 'single_choice', 'yes_no')),
  options_snapshot jsonb,
  answer_text text,
  answer_choice_id text,
  answer_yes_no boolean,
  created_at timestamptz not null default now()
);

create index if not exists job_application_screening_answers_app_idx
  on public.job_application_screening_answers (job_application_id);

create unique index if not exists job_application_screening_answers_app_question_uidx
  on public.job_application_screening_answers (job_application_id, source_question_id)
  where source_question_id is not null;

alter table public.job_application_screening_answers enable row level security;

drop policy if exists job_application_screening_answers_select_rbac
  on public.job_application_screening_answers;
create policy job_application_screening_answers_select_rbac
  on public.job_application_screening_answers
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

-- ---------------------------------------------------------------------------
-- job_application_screening_scores (per reviewer, per answer)
-- ---------------------------------------------------------------------------

create table if not exists public.job_application_screening_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  screening_answer_id uuid not null references public.job_application_screening_answers (id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles (id) on delete cascade,
  score smallint not null check (score >= 1 and score <= 5),
  updated_at timestamptz not null default now(),
  constraint job_application_screening_scores_answer_reviewer_uidx unique (screening_answer_id, reviewer_profile_id)
);

create index if not exists job_application_screening_scores_org_app_idx
  on public.job_application_screening_scores (org_id, screening_answer_id);

create or replace function public.job_application_screening_scores_set_org()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.org_id := (
    select a.org_id
    from public.job_application_screening_answers a
    where a.id = new.screening_answer_id
  );
  return new;
end;
$$;

drop trigger if exists job_application_screening_scores_set_org_trg
  on public.job_application_screening_scores;
create trigger job_application_screening_scores_set_org_trg
  before insert or update of screening_answer_id on public.job_application_screening_scores
  for each row
  execute function public.job_application_screening_scores_set_org();

alter table public.job_application_screening_scores enable row level security;

drop policy if exists job_application_screening_scores_select_rbac
  on public.job_application_screening_scores;
create policy job_application_screening_scores_select_rbac
  on public.job_application_screening_scores
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'applications.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'applications.manage', '{}'::jsonb)
    )
  );

-- ---------------------------------------------------------------------------
-- Permission catalog + grants (same roles as move_stage)
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  (
    'applications.score_screening',
    'Score screening answers',
    'Record numeric scores on candidate screening question answers.',
    false
  )
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, 'applications.score_screening'
from public.org_role_permissions rp
where rp.permission_key = 'applications.move_stage'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Public: screening questions for apply form (anon)
-- ---------------------------------------------------------------------------

create or replace function public.public_job_listing_screening_questions(
  p_org_slug text,
  p_job_slug text
)
returns table (
  id uuid,
  question_type text,
  prompt text,
  help_text text,
  required boolean,
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

-- ---------------------------------------------------------------------------
-- Aggregates for pipeline sorting (authenticated + permission)
-- ---------------------------------------------------------------------------

create or replace function public.get_job_listing_screening_aggregates(p_job_listing_id uuid)
returns table (
  job_application_id uuid,
  overall_avg numeric,
  distinct_scorer_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select jl.org_id into v_org
  from public.job_listings jl
  where jl.id = p_job_listing_id;

  if v_org is null then
    raise exception 'job listing not found';
  end if;

  if not (
    public.has_permission(v_viewer, v_org, 'applications.view', '{}'::jsonb)
    or public.has_permission(v_viewer, v_org, 'applications.manage', '{}'::jsonb)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  with apps as (
    select ja.id as app_id
    from public.job_applications ja
    where ja.job_listing_id = p_job_listing_id
      and ja.org_id = v_org
  ),
  per_answer_avg as (
    select
      a.job_application_id as app_id,
      avg(s.score)::numeric as q_avg
    from public.job_application_screening_answers a
    join public.job_application_screening_scores s on s.screening_answer_id = a.id
    where a.job_application_id in (select app_id from apps)
    group by a.job_application_id, a.id
  ),
  app_overall as (
    select
      paa.app_id,
      avg(paa.q_avg)::numeric as overall_avg
    from per_answer_avg paa
    group by paa.app_id
  ),
  app_scorers as (
    select
      a.job_application_id as app_id,
      count(distinct s.reviewer_profile_id)::bigint as scorers
    from public.job_application_screening_answers a
    join public.job_application_screening_scores s on s.screening_answer_id = a.id
    where a.job_application_id in (select app_id from apps)
    group by a.job_application_id
  )
  select
    a.app_id as job_application_id,
    ao.overall_avg,
    coalesce(sc.scorers, 0::bigint) as distinct_scorer_count
  from apps a
  left join app_overall ao on ao.app_id = a.app_id
  left join app_scorers sc on sc.app_id = a.app_id;
end;
$$;

grant execute on function public.get_job_listing_screening_aggregates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Upsert screening score
-- ---------------------------------------------------------------------------

create or replace function public.upsert_job_application_screening_score(
  p_screening_answer_id uuid,
  p_score smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  v_answer_org uuid;
  v_app_job uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'score must be between 1 and 5';
  end if;

  select a.org_id, ja.job_listing_id
  into v_answer_org, v_app_job
  from public.job_application_screening_answers a
  join public.job_applications ja on ja.id = a.job_application_id
  where a.id = p_screening_answer_id;

  if v_answer_org is null then
    raise exception 'screening answer not found';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = v_viewer;

  if v_org is null or v_org <> v_answer_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (
    public.has_permission(v_viewer, v_org, 'applications.score_screening', '{}'::jsonb)
    or public.has_permission(v_viewer, v_org, 'applications.manage', '{}'::jsonb)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.job_application_screening_scores (
    org_id,
    screening_answer_id,
    reviewer_profile_id,
    score
  ) values (
    v_answer_org,
    p_screening_answer_id,
    v_viewer,
    p_score
  )
  on conflict (screening_answer_id, reviewer_profile_id) do update
  set
    score = excluded.score,
    updated_at = now();
end;
$$;

grant execute on function public.upsert_job_application_screening_score(uuid, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_job_application: screening answers + close time
-- ---------------------------------------------------------------------------

drop function if exists public.submit_job_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
);

create or replace function public.submit_job_application(
  p_org_slug text,
  p_job_slug text,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_cv_storage_path text,
  p_loom_url text,
  p_staffsavvy_score smallint,
  p_expect_cv_upload boolean default false,
  p_candidate_location text default null,
  p_current_title text default null,
  p_linkedin_url text default null,
  p_portfolio_url text default null,
  p_motivation_text text default null,
  p_cover_letter text default null,
  p_eq_ethnicity_code text default null,
  p_equality_monitoring_declined boolean default false,
  p_screening_answers jsonb default '[]'::jsonb
)
returns table (application_id uuid, portal_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jl public.job_listings%rowtype;
  v_token text;
  v_new_id uuid;
  v_new_portal text;
  v_email text;
  v_name text;
  v_dept uuid;
  requires_any boolean := false;
  filled_channels int := 0;
  v_cv_filled boolean;
  v_submitter uuid;
  v_auth_email text;
  v_eq_code text;
  v_declined boolean;
  v_eq_at timestamptz;
  v_allowed boolean;
  v_codes jsonb;
  elem jsonb;
  v_actor_key text;
  v_rate_window_start timestamptz := now() - interval '10 minutes';
  v_recent_attempts int := 0;
  v_sa jsonb;
  v_q record;
  v_elem jsonb;
  v_qid uuid;
  v_found jsonb;
  v_text text;
  v_choice text;
  v_bool boolean;
  v_max_len int;
  v_opts jsonb;
  v_opt jsonb;
  v_ok_choice boolean;
  v_arr_len int;
  v_distinct int;
begin
  v_submitter := auth.uid();

  v_name := nullif(trim(p_candidate_name), '');
  v_email := lower(trim(p_candidate_email));
  if v_name is null then
    raise exception 'name required';
  end if;
  if v_email is null or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'valid email required';
  end if;

  if v_submitter is not null then
    select lower(trim(u.email)) into v_auth_email
    from auth.users u
    where u.id = v_submitter;
    if v_auth_email is null or v_auth_email <> v_email then
      raise exception 'email must match your signed-in account';
    end if;
  end if;

  select jl.* into v_jl
  from public.job_listings jl
  join public.organisations o on o.id = jl.org_id and o.is_active = true and o.slug = nullif(trim(p_org_slug), '')
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';

  if not found then
    raise exception 'job not found or not accepting applications';
  end if;

  if v_jl.applications_close_at is not null and now() > v_jl.applications_close_at then
    raise exception 'applications are closed for this role';
  end if;

  v_actor_key := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(inet_client_addr()::text, ''),
    'anon'
  );

  insert into public.job_application_rate_limit_events (actor_key, org_id, job_listing_id)
  values (v_actor_key, v_jl.org_id, v_jl.id);

  select count(*)::int
    into v_recent_attempts
  from public.job_application_rate_limit_events e
  where e.job_listing_id = v_jl.id
    and e.actor_key = v_actor_key
    and e.attempted_at >= v_rate_window_start;

  if v_recent_attempts > 15 then
    raise exception 'too many application attempts; please wait and try again';
  end if;

  if v_submitter is not null then
    if exists (
      select 1 from public.job_applications ja
      where ja.job_listing_id = v_jl.id
        and ja.candidate_user_id = v_submitter
    ) then
      raise exception 'you have already applied for this role';
    end if;
  end if;

  if exists (
    select 1 from public.job_applications ja
    where ja.job_listing_id = v_jl.id
      and lower(trim(ja.candidate_email)) = v_email
  ) then
    raise exception 'you have already applied for this role';
  end if;

  v_sa := coalesce(p_screening_answers, '[]'::jsonb);
  if jsonb_typeof(v_sa) <> 'array' then
    raise exception 'invalid screening answers';
  end if;

  v_arr_len := coalesce(jsonb_array_length(v_sa), 0);
  select count(distinct nullif(trim(e->>'question_id'), ''))::int
  into v_distinct
  from jsonb_array_elements(v_sa) e;
  if v_arr_len > 0 and v_distinct <> v_arr_len then
    raise exception 'duplicate screening question answers';
  end if;

  for v_elem in select * from jsonb_array_elements(v_sa)
  loop
    begin
      v_qid := (v_elem->>'question_id')::uuid;
    exception when others then
      raise exception 'invalid screening question id';
    end;
    if not exists (
      select 1
      from public.job_listing_screening_questions q
      where q.id = v_qid
        and q.job_listing_id = v_jl.id
    ) then
      raise exception 'unknown screening question for this job';
    end if;
  end loop;

  for v_q in
    select *
    from public.job_listing_screening_questions q
    where q.job_listing_id = v_jl.id
    order by q.sort_order, q.id
  loop
    v_found := null;
    for v_elem in select * from jsonb_array_elements(v_sa)
    loop
      begin
        v_qid := (v_elem->>'question_id')::uuid;
      exception when others then
        v_qid := null;
      end;
      if v_qid = v_q.id then
        v_found := v_elem;
        exit;
      end if;
    end loop;

    if v_found is null then
      if v_q.required then
        raise exception 'missing required screening answer';
      end if;
      continue;
    end if;

    if v_q.question_type in ('short_text', 'paragraph') then
      v_text := nullif(trim(v_found->>'text'), '');
      if v_text is null then
        raise exception 'screening answer required';
      end if;
      v_max_len := coalesce(v_q.max_length, case when v_q.question_type = 'short_text' then 500 else 8000 end);
      if length(v_text) > v_max_len then
        raise exception 'screening answer too long';
      end if;
    elsif v_q.question_type = 'single_choice' then
      v_choice := nullif(trim(v_found->>'choice_id'), '');
      if v_choice is null then
        raise exception 'screening choice required';
      end if;
      v_ok_choice := false;
      for v_opt in select * from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb))
      loop
        if v_opt ? 'id' and nullif(trim(v_opt->>'id'), '') = v_choice then
          v_ok_choice := true;
          exit;
        end if;
      end loop;
      if not v_ok_choice then
        raise exception 'invalid screening choice';
      end if;
    elsif v_q.question_type = 'yes_no' then
      if not (v_found ? 'bool') or jsonb_typeof(v_found->'bool') <> 'boolean' then
        raise exception 'screening yes or no required';
      end if;
      v_bool := (v_found->>'bool')::boolean;
    end if;
  end loop;

  v_dept := v_jl.department_id;

  v_cv_filled := (
    (p_cv_storage_path is not null and length(trim(p_cv_storage_path)) > 0)
    or (coalesce(p_expect_cv_upload, false) and v_jl.allow_cv)
  );

  if v_jl.allow_cv then
    requires_any := true;
    if v_cv_filled then
      filled_channels := filled_channels + 1;
    end if;
  end if;
  if v_jl.allow_loom then
    requires_any := true;
    if p_loom_url is not null and length(trim(p_loom_url)) > 0 then
      filled_channels := filled_channels + 1;
    end if;
  end if;
  if v_jl.allow_staffsavvy then
    requires_any := true;
    if p_staffsavvy_score is not null then
      filled_channels := filled_channels + 1;
    end if;
  end if;

  if v_jl.application_mode <> 'combination' then
    if v_jl.allow_cv and not v_jl.allow_loom and not v_jl.allow_staffsavvy then
      if not v_cv_filled then
        raise exception 'cv required';
      end if;
    elsif v_jl.allow_loom and not v_jl.allow_cv and not v_jl.allow_staffsavvy then
      if p_loom_url is null or length(trim(p_loom_url)) = 0 then
        raise exception 'loom url required';
      end if;
    elsif v_jl.allow_staffsavvy and not v_jl.allow_cv and not v_jl.allow_loom then
      if p_staffsavvy_score is null then
        raise exception 'staffsavvy score required';
      end if;
    end if;
  else
    if requires_any and filled_channels < 1 then
      raise exception 'complete at least one application field required for this job';
    end if;
  end if;

  if p_staffsavvy_score is not null and not v_jl.allow_staffsavvy then
    raise exception 'invalid application';
  end if;
  if p_cv_storage_path is not null and length(trim(p_cv_storage_path)) > 0 and not v_jl.allow_cv then
    raise exception 'invalid application';
  end if;
  if coalesce(p_expect_cv_upload, false) and not v_jl.allow_cv then
    raise exception 'invalid application';
  end if;
  if p_loom_url is not null and length(trim(p_loom_url)) > 0 and not v_jl.allow_loom then
    raise exception 'invalid application';
  end if;

  v_declined := coalesce(p_equality_monitoring_declined, false);
  v_eq_code := nullif(trim(p_eq_ethnicity_code), '');
  if v_declined and v_eq_code is not null then
    raise exception 'invalid equality monitoring';
  end if;
  if v_eq_code is not null then
    select coalesce(s.eq_category_codes, '[]'::jsonb)
    into v_codes
    from public.org_hr_metric_settings s
    where s.org_id = v_jl.org_id;
    if v_codes is null then
      v_codes := '[]'::jsonb;
    end if;
    v_allowed := false;
    for elem in select jsonb_array_elements(coalesce(v_codes, '[]'::jsonb))
    loop
      if lower(trim(elem->>'code')) = lower(v_eq_code) then
        v_allowed := true;
        exit;
      end if;
    end loop;
    if not v_allowed then
      raise exception 'invalid equality monitoring code';
    end if;
    v_eq_at := now();
  elsif v_declined then
    v_eq_at := now();
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.job_applications (
    org_id,
    job_listing_id,
    department_id,
    candidate_name,
    candidate_email,
    candidate_phone,
    stage,
    cv_storage_path,
    loom_url,
    staffsavvy_score,
    portal_token,
    candidate_location,
    current_title,
    linkedin_url,
    portfolio_url,
    motivation_text,
    cover_letter,
    candidate_user_id,
    eq_ethnicity_code,
    equality_monitoring_declined,
    equality_monitoring_recorded_at
  ) values (
    v_jl.org_id,
    v_jl.id,
    v_dept,
    v_name,
    v_email,
    nullif(trim(p_candidate_phone), ''),
    'applied',
    nullif(trim(p_cv_storage_path), ''),
    nullif(trim(p_loom_url), ''),
    p_staffsavvy_score,
    v_token,
    nullif(trim(p_candidate_location), ''),
    nullif(trim(p_current_title), ''),
    nullif(trim(p_linkedin_url), ''),
    nullif(trim(p_portfolio_url), ''),
    nullif(trim(p_motivation_text), ''),
    nullif(trim(p_cover_letter), ''),
    v_submitter,
    case when v_eq_code is not null then v_eq_code else null end,
    v_declined,
    v_eq_at
  )
  returning id, portal_token into v_new_id, v_new_portal;

  for v_q in
    select *
    from public.job_listing_screening_questions q
    where q.job_listing_id = v_jl.id
    order by q.sort_order, q.id
  loop
    v_found := null;
    for v_elem in select * from jsonb_array_elements(v_sa)
    loop
      if (v_elem->>'question_id')::uuid = v_q.id then
        v_found := v_elem;
        exit;
      end if;
    end loop;

    if v_found is null then
      continue;
    end if;

    if v_q.question_type in ('short_text', 'paragraph') then
      insert into public.job_application_screening_answers (
        org_id,
        job_application_id,
        source_question_id,
        prompt_snapshot,
        type_snapshot,
        options_snapshot,
        answer_text
      ) values (
        v_jl.org_id,
        v_new_id,
        v_q.id,
        v_q.prompt,
        v_q.question_type,
        v_q.options,
        nullif(trim(v_found->>'text'), '')
      );
    elsif v_q.question_type = 'single_choice' then
      insert into public.job_application_screening_answers (
        org_id,
        job_application_id,
        source_question_id,
        prompt_snapshot,
        type_snapshot,
        options_snapshot,
        answer_choice_id
      ) values (
        v_jl.org_id,
        v_new_id,
        v_q.id,
        v_q.prompt,
        v_q.question_type,
        v_q.options,
        nullif(trim(v_found->>'choice_id'), '')
      );
    elsif v_q.question_type = 'yes_no' then
      insert into public.job_application_screening_answers (
        org_id,
        job_application_id,
        source_question_id,
        prompt_snapshot,
        type_snapshot,
        options_snapshot,
        answer_yes_no
      ) values (
        v_jl.org_id,
        v_new_id,
        v_q.id,
        v_q.prompt,
        v_q.question_type,
        v_q.options,
        (v_found->>'bool')::boolean
      );
    end if;
  end loop;

  return query select v_new_id, v_new_portal;
end;
$$;

grant execute on function public.submit_job_application(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  jsonb
) to anon, authenticated;
