-- Phase 6 — Additional indexes for feed, admin filters, and junction lookups.
-- (Core FK indexes already exist from earlier phases; this adds composites and missing junction indexes.)

-- Feed: sent broadcasts by org, newest first (partial index keeps it small).
create index if not exists broadcasts_org_status_sent_at_idx
  on public.broadcasts (org_id, sent_at desc)
  where status = 'sent';

-- Admin / approval queues: broadcasts by org + status.
create index if not exists broadcasts_org_status_idx
  on public.broadcasts (org_id, status);

-- User management filters.
create index if not exists profiles_org_status_idx
  on public.profiles (org_id, status);

create index if not exists profiles_org_role_idx
  on public.profiles (org_id, role);

-- Junction tables (manager dashboard, membership checks).
create index if not exists user_departments_dept_id_idx
  on public.user_departments (dept_id);

create index if not exists dept_managers_dept_id_idx
  on public.dept_managers (dept_id);

create index if not exists dept_managers_user_id_idx
  on public.dept_managers (user_id);
