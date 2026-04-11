-- Restore DB-side anti-spam throttle on submit_job_application (see 20260618170000_phase7).
-- Inserted after the listing is resolved, before duplicate-application checks.

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
  p_equality_monitoring_declined boolean default false
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
  boolean
) to anon, authenticated;
