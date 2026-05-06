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

-- Sample saved reports for local UI testing (Run / export). Org-visible; keep JSON in sync with
-- apps/web/src/lib/reports/fixtures/report-seed-fixtures.json
insert into public.reports (id, org_id, created_by, updated_by, name, description, domains, config, tags, visibility, shared_role_keys)
select
  'f1000000-0000-4000-8000-000000000001'::uuid,
  o.id,
  p.id,
  p.id,
  'Sample: Active employees',
  'Dev seed — active staff only (quick filter). Use Run to preview rows.',
  array['hr']::text[],
  '{"domains":["hr"],"fields":["employee_name","employee_department","employee_role","employee_status"],"filters":[],"filterMode":"and","sort":[],"groupBy":[],"quickFilters":["active_only"],"departmentIds":[]}'::jsonb,
  array['seed', 'sample']::text[],
  'org',
  '{}'::text[]
from public.organisations o
cross join lateral (
  select id from public.profiles where org_id = o.id order by created_at asc nulls last limit 1
) p
where o.slug = 'demo'
on conflict (id) do nothing;

insert into public.reports (id, org_id, created_by, updated_by, name, description, domains, config, tags, visibility, shared_role_keys)
select
  'f1000000-0000-4000-8000-000000000002'::uuid,
  o.id,
  p.id,
  p.id,
  'Sample: Staff directory',
  'Dev seed — directory-style columns including tenure and onboarding.',
  array['hr']::text[],
  '{"domains":["hr"],"fields":["employee_name","employee_department","employee_role","employee_status","employee_start_date","onboarding_status","onboarding_days_since_start"],"filters":[],"filterMode":"and","sort":[{"field":"employee_name","direction":"asc"}],"groupBy":[],"quickFilters":[],"departmentIds":[]}'::jsonb,
  array['seed', 'sample']::text[],
  'org',
  '{}'::text[]
from public.organisations o
cross join lateral (
  select id from public.profiles where org_id = o.id order by created_at asc nulls last limit 1
) p
where o.slug = 'demo'
on conflict (id) do nothing;

insert into public.reports (id, org_id, created_by, updated_by, name, description, domains, config, tags, visibility, shared_role_keys)
select
  'f1000000-0000-4000-8000-000000000003'::uuid,
  o.id,
  p.id,
  p.id,
  'Sample: Time & pay snapshot',
  'Dev seed — HR + finance fields (timesheets, wagesheets, bank changes).',
  array['hr', 'finance']::text[],
  '{"domains":["hr","finance"],"fields":["employee_name","employee_department","timesheet_week_start","timesheet_hours_total","timesheet_status","wagesheet_status","tax_document_status","bank_detail_change_status","bank_detail_change_at"],"filters":[],"filterMode":"and","sort":[],"groupBy":[],"quickFilters":[],"departmentIds":[]}'::jsonb,
  array['seed', 'sample']::text[],
  'org',
  '{}'::text[]
from public.organisations o
cross join lateral (
  select id from public.profiles where org_id = o.id order by created_at asc nulls last limit 1
) p
where o.slug = 'demo'
on conflict (id) do nothing;
