-- Dev seed — applied after migrations. Uses idempotent checks.

insert into public.organisations (name, slug, is_active)
values ('Demo Students'' Union', 'demo', true)
on conflict (slug) do nothing;

insert into public.departments (org_id, name, description, type, is_archived)
select o.id, 'Human Resources', 'HR team', 'department', false
from public.organisations o
where o.slug = 'demo'
  and not exists (
    select 1 from public.departments d where d.org_id = o.id and d.name = 'Human Resources'
  );

insert into public.departments (org_id, name, description, type, is_archived)
select o.id, 'Events', 'Events and venues', 'department', false
from public.organisations o
where o.slug = 'demo'
  and not exists (
    select 1 from public.departments d where d.org_id = o.id and d.name = 'Events'
  );

insert into public.departments (org_id, name, description, type, is_archived)
select o.id, 'Photography Society', null, 'society', false
from public.organisations o
where o.slug = 'demo'
  and not exists (
    select 1 from public.departments d where d.org_id = o.id and d.name = 'Photography Society'
  );

insert into public.broadcast_channels (dept_id, name)
select d.id, v.name
from public.departments d
join public.organisations o on o.id = d.org_id and o.slug = 'demo'
cross join (values ('Announcements'), ('Recruitment'), ('Lost Property')) as v(name)
where d.name = 'Human Resources'
on conflict (dept_id, name) do nothing;

insert into public.broadcast_channels (dept_id, name)
select d.id, v.name
from public.departments d
join public.organisations o on o.id = d.org_id and o.slug = 'demo'
cross join (values ('Events'), ('Training')) as v(name)
where d.name = 'Events'
on conflict (dept_id, name) do nothing;
