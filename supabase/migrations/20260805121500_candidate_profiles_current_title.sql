-- Cache "current role / title" on candidate_profiles so apply flows can pre-fill
-- and stay in sync after submission (plan: profile-level current_title).

alter table public.candidate_profiles
  add column if not exists current_title text;
