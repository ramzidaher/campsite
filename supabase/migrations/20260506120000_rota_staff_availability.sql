-- Weekly staff availability: recurring template (Mon–Sun) + per-date overrides.
-- CSA / administrator edit their own rows; managers/coordinators/org admins read per policy.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rota_staff_availability_template (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null
    check (weekday >= 0 and weekday <= 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

comment on table public.rota_staff_availability_template is
  'Recurring weekly availability; weekday 0=Monday … 6=Sunday (matches web startOfWeekMonday).';

create index if not exists rota_staff_availability_template_org_user_idx
  on public.rota_staff_availability_template (org_id, user_id);

create unique index if not exists rota_staff_availability_template_dedupe_idx
  on public.rota_staff_availability_template (org_id, user_id, weekday, start_time, end_time);

create table if not exists public.rota_staff_availability_override (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  on_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

comment on table public.rota_staff_availability_override is
  'If any rows exist for (user_id, on_date), that date uses only overrides (template ignored for that date).';

create index if not exists rota_staff_availability_override_org_user_date_idx
  on public.rota_staff_availability_override (org_id, user_id, on_date);

create unique index if not exists rota_staff_availability_override_dedupe_idx
  on public.rota_staff_availability_override (org_id, user_id, on_date, start_time, end_time);

-- ---------------------------------------------------------------------------
-- Validation: org_id and user_id must match profile org
-- ---------------------------------------------------------------------------

create or replace function public.rota_staff_availability_org_match_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_org uuid;
begin
  if new.org_id <> public.current_org_id() then
    raise exception 'org_id must match active organisation';
  end if;
  select p.org_id into p_org from public.profiles p where p.id = new.user_id;
  if p_org is null or p_org <> new.org_id then
    raise exception 'user_id must belong to the same organisation';
  end if;
  return new;
end;
$$;

drop trigger if exists rota_staff_availability_template_org_match on public.rota_staff_availability_template;
create trigger rota_staff_availability_template_org_match
  before insert or update on public.rota_staff_availability_template
  for each row execute procedure public.rota_staff_availability_org_match_fn();

drop trigger if exists rota_staff_availability_override_org_match on public.rota_staff_availability_override;
create trigger rota_staff_availability_override_org_match
  before insert or update on public.rota_staff_availability_override
  for each row execute procedure public.rota_staff_availability_org_match_fn();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_submit_staff_availability()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.org_id = public.current_org_id()
      and p.status = 'active'
      and p.role in ('csa', 'administrator')
  );
$$;

create or replace function public.staff_availability_row_visible_to_me(p_subject_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
begin
  if p_subject_user_id is null then
    return false;
  end if;
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid()
    and p.org_id = public.current_org_id()
    and p.status = 'active';
  if v_org is null then
    return false;
  end if;
  if p_subject_user_id = auth.uid() then
    return true;
  end if;
  if v_role in ('org_admin', 'super_admin') then
    return exists (
      select 1 from public.profiles t
      where t.id = p_subject_user_id and t.org_id = v_org and t.status = 'active'
    );
  end if;
  if v_role = 'coordinator' then
    return exists (
      select 1
      from public.user_departments vu
      join public.user_departments tu
        on tu.dept_id = vu.dept_id and tu.user_id = p_subject_user_id
      where vu.user_id = auth.uid()
    );
  end if;
  if v_role = 'manager' then
    return exists (
      select 1
      from public.dept_managers dm
      join public.user_departments tu
        on tu.dept_id = dm.dept_id and tu.user_id = p_subject_user_id
      where dm.user_id = auth.uid()
    );
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: template
-- ---------------------------------------------------------------------------

alter table public.rota_staff_availability_template enable row level security;

drop policy if exists rota_staff_availability_template_select on public.rota_staff_availability_template;
create policy rota_staff_availability_template_select
  on public.rota_staff_availability_template
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.staff_availability_row_visible_to_me(user_id)
  );

drop policy if exists rota_staff_availability_template_insert on public.rota_staff_availability_template;
create policy rota_staff_availability_template_insert
  on public.rota_staff_availability_template
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

drop policy if exists rota_staff_availability_template_update on public.rota_staff_availability_template;
create policy rota_staff_availability_template_update
  on public.rota_staff_availability_template
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  )
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

drop policy if exists rota_staff_availability_template_delete on public.rota_staff_availability_template;
create policy rota_staff_availability_template_delete
  on public.rota_staff_availability_template
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

-- ---------------------------------------------------------------------------
-- RLS: override
-- ---------------------------------------------------------------------------

alter table public.rota_staff_availability_override enable row level security;

drop policy if exists rota_staff_availability_override_select on public.rota_staff_availability_override;
create policy rota_staff_availability_override_select
  on public.rota_staff_availability_override
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.staff_availability_row_visible_to_me(user_id)
  );

drop policy if exists rota_staff_availability_override_insert on public.rota_staff_availability_override;
create policy rota_staff_availability_override_insert
  on public.rota_staff_availability_override
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

drop policy if exists rota_staff_availability_override_update on public.rota_staff_availability_override;
create policy rota_staff_availability_override_update
  on public.rota_staff_availability_override
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  )
  with check (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

drop policy if exists rota_staff_availability_override_delete on public.rota_staff_availability_override;
create policy rota_staff_availability_override_delete
  on public.rota_staff_availability_override
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.can_submit_staff_availability()
  );

grant select, insert, update, delete on public.rota_staff_availability_template to authenticated;
grant select, insert, update, delete on public.rota_staff_availability_override to authenticated;

-- ---------------------------------------------------------------------------
-- Effective availability for a date range (template expanded + overrides)
-- ---------------------------------------------------------------------------

create or replace function public.staff_availability_effective_for_range(
  p_user_id uuid,
  p_from date,
  p_to date
)
returns table(out_date date, start_time time, end_time time)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d date;
  w smallint;
  has_override boolean;
begin
  if p_user_id is null or p_from is null or p_to is null or p_to < p_from then
    return;
  end if;
  if not public.staff_availability_row_visible_to_me(p_user_id) then
    raise exception 'not allowed';
  end if;

  d := p_from;
  while d <= p_to loop
    select exists (
      select 1 from public.rota_staff_availability_override o
      where o.user_id = p_user_id
        and o.org_id = public.current_org_id()
        and o.on_date = d
    ) into has_override;

    if has_override then
      return query
      select o.on_date, o.start_time, o.end_time
      from public.rota_staff_availability_override o
      where o.user_id = p_user_id
        and o.org_id = public.current_org_id()
        and o.on_date = d
      order by o.start_time;
    else
      -- ISO weekday Mon=1 … Sun=7 → template weekday Mon=0 … Sun=6
      w := (extract(isodow from d)::int - 1)::smallint;

      return query
      select d, t.start_time, t.end_time
      from public.rota_staff_availability_template t
      where t.user_id = p_user_id
        and t.org_id = public.current_org_id()
        and t.weekday = w
      order by t.start_time;
    end if;

    d := d + 1;
  end loop;
end;
$$;

comment on function public.staff_availability_effective_for_range(uuid, date, date) is
  'Expands template + overrides for p_user_id between p_from and p_to inclusive; caller must be allowed to view that subject.';

grant execute on function public.staff_availability_effective_for_range(uuid, date, date) to authenticated;
