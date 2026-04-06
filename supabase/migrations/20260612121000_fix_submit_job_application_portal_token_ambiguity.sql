-- Fix ambiguous portal_token reference in submit_job_application().
-- The output column name `portal_token` in RETURNS TABLE can conflict with
-- unqualified references in `RETURNING portal_token`.

create or replace function public.submit_job_application(
  p_org_slug text,
  p_job_slug text,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_cv_storage_path text,
  p_loom_url text,
  p_staffsavvy_score smallint,
  p_expect_cv_upload boolean default false
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
begin
  v_name := nullif(trim(p_candidate_name), '');
  v_email := lower(trim(p_candidate_email));
  if v_name is null then
    raise exception 'name required';
  end if;
  if v_email is null or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'valid email required';
  end if;

  select jl.* into v_jl
  from public.job_listings jl
  join public.organisations o on o.id = jl.org_id and o.is_active = true and o.slug = nullif(trim(p_org_slug), '')
  where jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';

  if not found then
    raise exception 'job not found or not accepting applications';
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

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.job_applications as ja (
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
    portal_token
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
    v_token
  )
  returning ja.id, ja.portal_token into v_new_id, v_new_portal;

  return query select v_new_id, v_new_portal;
end;
$$;

grant execute on function public.submit_job_application(text, text, text, text, text, text, text, smallint, boolean)
  to anon, authenticated;
