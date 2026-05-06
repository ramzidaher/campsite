-- Candidate portal: claim guest applications by email at signup, plus a
-- runtime RPC to claim on demand (e.g. after login or post-email-verification).
--
-- Background: previously a candidate could submit job applications without an
-- account, leaving job_applications.candidate_user_id NULL. The portal at
-- /jobs/me filters by candidate_user_id = auth.uid(), so those rows were
-- invisible. With apply now requiring auth, this migration:
--  1) Extends the on-signup trigger to back-link any prior orphan applications
--     where lower(candidate_email) = lower(auth user email).
--  2) Exposes claim_my_applications() so the app can heal drift on login or
--     after email confirmation without forcing the user to re-register.
-- Both code paths use security definer; only an authenticated user may claim
-- their own applications by their own auth.users email.

-- ---------------------------------------------------------------------------
-- 1) Extend handle_new_candidate_profile() to back-link guest applications.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_candidate_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skills text[];
  v_email  text;
begin
  -- Staff / org registration path (RegisterWizard)  profiles row is created elsewhere.
  if nullif(trim(coalesce(new.raw_user_meta_data->>'register_org_id', '')), '') is not null then
    return new;
  end if;

  if coalesce(new.raw_user_meta_data->>'account_type', '') <> 'candidate' then
    return new;
  end if;

  -- Parse skills JSON array if present (stored as a JSON array string).
  begin
    if new.raw_user_meta_data->'skills' is not null then
      select array_agg(elem::text)
        into v_skills
        from jsonb_array_elements_text(new.raw_user_meta_data->'skills') as elem;
    end if;
  exception when others then
    v_skills := null;
  end;

  insert into public.candidate_profiles (id, full_name, persona, skills)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'persona', '')), ''),
    v_skills
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, candidate_profiles.full_name),
    persona   = coalesce(excluded.persona,   candidate_profiles.persona),
    skills    = coalesce(excluded.skills,    candidate_profiles.skills),
    updated_at = now();

  -- Back-link any prior guest applications submitted with this email.
  v_email := lower(trim(coalesce(new.email, '')));
  if v_email <> '' then
    update public.job_applications ja
       set candidate_user_id = new.id
     where ja.candidate_user_id is null
       and lower(trim(ja.candidate_email)) = v_email;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) claim_my_applications(): runtime claim for the current authenticated user.
-- ---------------------------------------------------------------------------

create or replace function public.claim_my_applications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_count   integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  select lower(trim(u.email)) into v_email
    from auth.users u
   where u.id = v_user_id;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  with linked as (
    update public.job_applications ja
       set candidate_user_id = v_user_id
     where ja.candidate_user_id is null
       and lower(trim(ja.candidate_email)) = v_email
    returning ja.id
  )
  select count(*)::int into v_count from linked;

  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.claim_my_applications() from public;
grant execute on function public.claim_my_applications() to authenticated;
