-- Add persona + skills to candidate_profiles.
-- Populated from auth.users.raw_user_meta_data by the registration trigger
-- so they are saved even before the candidate has confirmed their email.

alter table public.candidate_profiles
  add column if not exists persona text,
  add column if not exists skills  text[];

-- Update the trigger so new signups carry persona + skills through.
create or replace function public.handle_new_candidate_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skills text[];
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

  return new;
end;
$$;
