-- Older web bundles still call REST `dept_teams` / `user_dept_teams` after rename to
-- `department_teams` / `department_team_members` (20260430290000). PostgREST returns 404
-- when the resource name is missing; these views restore the legacy API paths.

drop view if exists public.user_dept_teams;
drop view if exists public.dept_teams;

create view public.dept_teams
with (security_invoker = true)
as
select
  id,
  dept_id,
  name,
  lead_user_id,
  created_at
from public.department_teams;

create view public.user_dept_teams
with (security_invoker = true)
as
select
  user_id,
  team_id
from public.department_team_members;

comment on view public.dept_teams is
  'Compatibility alias for public.department_teams (legacy PostgREST path).';

comment on view public.user_dept_teams is
  'Compatibility alias for public.department_team_members (legacy PostgREST path).';

grant select on public.dept_teams to authenticated;
grant select on public.dept_teams to service_role;
grant select on public.user_dept_teams to authenticated;
grant select on public.user_dept_teams to service_role;
