-- Persist celebratory shell mode across devices.
alter table public.profiles
  add column if not exists celebration_mode text not null default 'off';

-- Keep accepted values explicit.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_celebration_mode_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_celebration_mode_check
      check (celebration_mode in ('off', 'pride', 'sunset', 'ocean', 'forest'));
  end if;
end
$$;

update public.profiles
set celebration_mode = 'off'
where celebration_mode is null;

-- Fix recursive RLS path on profiles.
drop policy if exists profiles_select_department_isolation on public.profiles;
create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (
      org_id = public.current_org_id()
      and (
        public.is_effective_org_admin(auth.uid(), org_id)
        or exists (
          select 1
          from public.user_departments u1
          join public.user_departments u2
            on u1.dept_id = u2.dept_id
          join public.departments d
            on d.id = u1.dept_id
          where u1.user_id = auth.uid()
            and u2.user_id = profiles.id
            and d.org_id = profiles.org_id
            and not d.is_archived
        )
      )
    )
  );
