-- Prevent broad visibility permissions from being reintroduced for non-management predefined roles.

create or replace function public.block_restricted_visibility_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_key text;
begin
  select r.key into v_role_key
  from public.org_roles r
  where r.id = new.role_id;

  if v_role_key is null then
    return new;
  end if;

  if v_role_key = any (array[
    'senior_developer',
    'senior_analyst',
    'senior_accountant',
    'senior_engineer',
    'developer_engineer',
    'it_admin_devops_engineer',
    'marketing_executive',
    'sales_executive',
    'finance_officer',
    'coordinator',
    'assistant',
    'junior_staff',
    'intern_trainee'
  ]) and new.permission_key = any (array['members.view', 'hr.view_records']) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists org_role_permissions_block_restricted_visibility_trg on public.org_role_permissions;
create trigger org_role_permissions_block_restricted_visibility_trg
before insert on public.org_role_permissions
for each row
execute procedure public.block_restricted_visibility_permissions();
