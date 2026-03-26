-- Run in Supabase Dashboard → SQL (or psql against your project) after
-- 20260329120000_v2_profile_roles.sql has been applied.

-- 1) No legacy role literals should remain on profiles
select role, count(*) as n
from public.profiles
where role in ('super_admin', 'senior_manager', 'assistant', 'weekly_paid')
group by role;
-- Expect: 0 rows.

-- 2) CHECK constraint allows only v2 roles (+ society_leader)
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'c';

-- 3) Your account (replace email)
select id, full_name, role, status
from public.profiles
where id in (select id from auth.users where email = 'you@example.com');

-- 4) Optional: list org admins
select id, full_name, email, role
from public.profiles p
left join auth.users u on u.id = p.id
where p.role = 'org_admin'
order by p.full_name;
