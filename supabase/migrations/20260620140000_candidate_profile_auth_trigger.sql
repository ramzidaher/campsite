-- Phase 2: auto-provision candidate_profiles when a candidate-only auth user is created
-- (no staff self-registration metadata). Skips users going through org/team registration.

create or replace function public.handle_new_candidate_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff / org registration path (RegisterWizard)  profiles row is created elsewhere.
  if nullif(trim(coalesce(new.raw_user_meta_data->>'register_org_id', '')), '') is not null then
    return new;
  end if;

  if coalesce(new.raw_user_meta_data->>'account_type', '') <> 'candidate' then
    return new;
  end if;

  insert into public.candidate_profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, candidate_profiles.full_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_candidate_profile on auth.users;

create trigger on_auth_user_candidate_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_candidate_profile();
