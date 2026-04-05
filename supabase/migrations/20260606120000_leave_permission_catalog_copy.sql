-- Clearer permission copy (avoid jargon; match in-app HR terminology).

insert into public.permission_catalog (key, label, description, is_founder_only)
values (
  'leave.view_own',
  'View own leave',
  'View own leave balances, requests, and sickness absence score.',
  false
)
on conflict (key) do update
set description = excluded.description;
