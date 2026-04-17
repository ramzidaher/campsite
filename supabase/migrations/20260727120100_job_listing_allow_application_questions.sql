-- Treat configured role questions as an application channel (Combinable with CV/Loom/StaffSavvy,
-- or alone when only "Role application questions" is enabled for the listing).

alter table public.job_listings
  add column if not exists allow_application_questions boolean not null default false;

comment on column public.job_listings.allow_application_questions is
  'When true, required role application questions satisfy the combination-mode "at least one channel" rule.';

alter table public.job_listings
  drop constraint if exists job_listings_combination_requires_channel;

alter table public.job_listings
  add constraint job_listings_combination_requires_channel check (
    application_mode <> 'combination'
    or (
      allow_cv
      or allow_loom
      or allow_staffsavvy
      or allow_application_questions
    )
  );

-- ---------------------------------------------------------------------------
-- Public job row: expose question-only application channel flag
-- ---------------------------------------------------------------------------

drop function if exists public.public_job_listing_by_slug(text, text);

create function public.public_job_listing_by_slug(
  p_org_slug text,
  p_job_slug text
)
returns table (
  job_listing_id uuid,
  org_name text,
  title text,
  advert_copy text,
  requirements text,
  benefits text,
  grade_level text,
  salary_band text,
  contract_type text,
  department_name text,
  application_mode text,
  allow_cv boolean,
  allow_loom boolean,
  allow_staffsavvy boolean,
  allow_application_questions boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    jl.id as job_listing_id,
    o.name::text as org_name,
    jl.title,
    jl.advert_copy,
    jl.requirements,
    jl.benefits,
    jl.grade_level,
    jl.salary_band,
    jl.contract_type,
    d.name::text as department_name,
    jl.application_mode,
    jl.allow_cv,
    jl.allow_loom,
    jl.allow_staffsavvy,
    coalesce(jl.allow_application_questions, false) as allow_application_questions,
    jl.published_at
  from public.job_listings jl
  join public.organisations o
    on o.id = jl.org_id
    and o.is_active = true
    and o.slug = nullif(trim(p_org_slug), '')
  join public.departments d
    on d.id = jl.department_id
    and d.org_id = jl.org_id
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';
$$;

grant execute on function public.public_job_listing_by_slug(text, text) to anon;
grant execute on function public.public_job_listing_by_slug(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_job_application: count role-questions as a filled application channel
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
  boolean,
  jsonb
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
  v_opt jsonb;
  v_ok_choice boolean;
  v_arr_len int;
  v_distinct int;
  v_has_questions boolean := false;
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

  select exists(
    select 1 from public.job_listing_screening_questions q where q.job_listing_id = v_jl.id
  ) into v_has_questions;

  if coalesce(v_jl.allow_application_questions, false) and not v_has_questions then
    raise exception 'role application questions are enabled but this job has no questions configured';
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
    raise exception 'invalid application question answers';
  end if;

  v_arr_len := coalesce(jsonb_array_length(v_sa), 0);
  select count(distinct nullif(trim(e->>'question_id'), ''))::int
  into v_distinct
  from jsonb_array_elements(v_sa) e;
  if v_arr_len > 0 and v_distinct <> v_arr_len then
    raise exception 'duplicate application question answers';
  end if;

  for v_elem in select * from jsonb_array_elements(v_sa)
  loop
    begin
      v_qid := (v_elem->>'question_id')::uuid;
    exception when others then
      raise exception 'invalid application question id';
    end;
    if not exists (
      select 1
      from public.job_listing_screening_questions q
      where q.id = v_qid
        and q.job_listing_id = v_jl.id
    ) then
      raise exception 'unknown application question for this job';
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
        raise exception 'missing required application question answer';
      end if;
      continue;
    end if;

    if v_q.question_type in ('short_text', 'paragraph') then
      v_text := nullif(trim(v_found->>'text'), '');
      if v_text is null then
        raise exception 'application question answer required';
      end if;
      v_max_len := coalesce(v_q.max_length, case when v_q.question_type = 'short_text' then 500 else 8000 end);
      if length(v_text) > v_max_len then
        raise exception 'application question answer too long';
      end if;
    elsif v_q.question_type = 'single_choice' then
      v_choice := nullif(trim(v_found->>'choice_id'), '');
      if v_choice is null then
        raise exception 'application question choice required';
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
        raise exception 'invalid application question choice';
      end if;
    elsif v_q.question_type = 'yes_no' then
      if not (v_found ? 'bool') or jsonb_typeof(v_found->'bool') <> 'boolean' then
        raise exception 'application yes or no answer required';
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

  if coalesce(v_jl.allow_application_questions, false) and v_has_questions then
    requires_any := true;
    filled_channels := filled_channels + 1;
  end if;

  if v_jl.application_mode <> 'combination' then
    if v_jl.allow_cv and not v_jl.allow_loom and not v_jl.allow_staffsavvy and not coalesce(v_jl.allow_application_questions, false) then
      if not v_cv_filled then
        raise exception 'cv required';
      end if;
    elsif v_jl.allow_loom and not v_jl.allow_cv and not v_jl.allow_staffsavvy and not coalesce(v_jl.allow_application_questions, false) then
      if p_loom_url is null or length(trim(p_loom_url)) = 0 then
        raise exception 'loom url required';
      end if;
    elsif v_jl.allow_staffsavvy and not v_jl.allow_cv and not v_jl.allow_loom and not coalesce(v_jl.allow_application_questions, false) then
      if p_staffsavvy_score is null then
        raise exception 'staffsavvy score required';
      end if;
    elsif coalesce(v_jl.allow_application_questions, false) and not v_jl.allow_cv and not v_jl.allow_loom and not v_jl.allow_staffsavvy then
      null;
    elsif v_jl.allow_cv and not v_jl.allow_loom and not v_jl.allow_staffsavvy and coalesce(v_jl.allow_application_questions, false) then
      if not v_cv_filled then
        raise exception 'cv required';
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

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  (
    'applications.score_screening',
    'Score application question answers',
    'Record numeric scores on candidate answers to role application questions.',
    false
  )
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;
