-- Collaboration broadcasts across departments.
-- A sent broadcast can include additional departments so members subscribed
-- to channels in any participating department can receive it.

create table if not exists public.broadcast_collab_departments (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  dept_id uuid not null references public.departments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, dept_id)
);

create index if not exists broadcast_collab_departments_dept_id_idx
  on public.broadcast_collab_departments (dept_id);

alter table public.broadcast_collab_departments enable row level security;

drop policy if exists broadcast_collab_departments_select_org on public.broadcast_collab_departments;
create policy broadcast_collab_departments_select_org
  on public.broadcast_collab_departments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_collab_departments.broadcast_id
        and b.org_id = public.current_org_id()
        and public.broadcast_visible_to_reader(b)
    )
  );

drop policy if exists broadcast_collab_departments_insert_author on public.broadcast_collab_departments;
create policy broadcast_collab_departments_insert_author
  on public.broadcast_collab_departments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_collab_departments.broadcast_id
        and b.org_id = public.current_org_id()
        and b.created_by = auth.uid()
        and public.user_may_broadcast_to_dept(broadcast_collab_departments.dept_id)
    )
  );

drop policy if exists broadcast_collab_departments_delete_author on public.broadcast_collab_departments;
create policy broadcast_collab_departments_delete_author
  on public.broadcast_collab_departments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_collab_departments.broadcast_id
        and b.org_id = public.current_org_id()
        and b.created_by = auth.uid()
    )
  );

create or replace function public.broadcast_collab_departments_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b_org uuid;
  b_dept uuid;
  d_org uuid;
begin
  select b.org_id, b.dept_id into b_org, b_dept
  from public.broadcasts b
  where b.id = new.broadcast_id;

  if b_org is null then
    raise exception 'Invalid broadcast';
  end if;

  select d.org_id into d_org
  from public.departments d
  where d.id = new.dept_id;

  if d_org is null then
    raise exception 'Invalid department';
  end if;

  if d_org <> b_org then
    raise exception 'Collaboration department must belong to the same organisation';
  end if;

  if new.dept_id = b_dept then
    raise exception 'Primary department is already set on the broadcast';
  end if;

  return new;
end;
$$;

drop trigger if exists broadcast_collab_departments_validate on public.broadcast_collab_departments;
create trigger broadcast_collab_departments_validate
before insert or update on public.broadcast_collab_departments
for each row
execute procedure public.broadcast_collab_departments_validate_fn();

create or replace function public.user_should_receive_sent_broadcast(
  p_user_id uuid,
  b public.broadcasts
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  if b.id is null or b.status is distinct from 'sent' then
    return false;
  end if;

  select p.org_id, p.status into v_org, v_status
  from public.profiles p
  where p.id = p_user_id;

  if v_org is null or v_org <> b.org_id then
    return false;
  end if;

  if coalesce(v_status, '') <> 'active' and p_user_id is distinct from b.created_by then
    return false;
  end if;

  if coalesce(b.is_mandatory, false) then
    return true;
  end if;

  if coalesce(b.is_org_wide, false) then
    return true;
  end if;

  if b.created_by = p_user_id then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role in ('org_admin', 'super_admin')
  ) then
    return true;
  end if;

  if b.team_id is not null then
    if not exists (
      select 1
      from public.department_team_members udt
      where udt.user_id = p_user_id
        and udt.team_id = b.team_id
    ) then
      return false;
    end if;
  end if;

  if b.channel_id is not null and exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.channel_id = b.channel_id
      and us.subscribed = true
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.broadcast_collab_departments bcd
    join public.broadcast_channels c
      on c.dept_id = bcd.dept_id
    join public.user_subscriptions us
      on us.channel_id = c.id
    where bcd.broadcast_id = b.id
      and us.user_id = p_user_id
      and us.subscribed = true
  );
end;
$$;

revoke all on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) from public;
grant execute on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) to service_role;
