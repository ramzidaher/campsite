-- Phase 3: draft vs published rotas  visibility + suppress shift notification jobs while draft.

alter table public.rotas
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'published'));

alter table public.rotas
  add column if not exists published_at timestamptz;

comment on column public.rotas.status is
  'draft: visible only to rota editors (can_manage_rota_assignments). published: normal org visibility.';

update public.rotas set published_at = coalesce(published_at, created_at) where status = 'published' and published_at is null;

drop policy if exists rotas_select on public.rotas;
create policy rotas_select
  on public.rotas
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
    and (
      status = 'published'
      or public.can_manage_rota_assignments(id)
    )
  );

drop policy if exists rota_members_select on public.rota_members;
create policy rota_members_select
  on public.rota_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rotas r
      where r.id = rota_members.rota_id
        and r.org_id = public.current_org_id()
        and (
          r.status = 'published'
          or public.can_manage_rota_assignments(r.id)
        )
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
  );

drop policy if exists rota_shifts_select on public.rota_shifts;
create policy rota_shifts_select
  on public.rota_shifts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
    and (
      (
        rota_id is null
        and (
          user_id = auth.uid()
          or user_id is null
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('org_admin', 'super_admin', 'coordinator')
          )
          or exists (
            select 1 from public.dept_managers dm
            where dm.user_id = auth.uid()
              and dm.dept_id = rota_shifts.dept_id
          )
        )
      )
      or (
        rota_id is not null
        and exists (
          select 1 from public.rotas r
          where r.id = rota_shifts.rota_id
            and (
              r.status = 'published'
              or public.can_manage_rota_assignments(r.id)
            )
        )
        and (
          user_id = auth.uid()
          or user_id is null
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('org_admin', 'super_admin', 'coordinator')
          )
          or exists (
            select 1 from public.rotas r
            where r.id = rota_shifts.rota_id
              and r.owner_id = auth.uid()
          )
          or exists (
            select 1 from public.rota_members m
            where m.rota_id = rota_shifts.rota_id
              and m.user_id = auth.uid()
          )
          or exists (
            select 1 from public.dept_managers dm
            where dm.user_id = auth.uid()
              and (
                dm.dept_id = rota_shifts.dept_id
                or dm.dept_id = (select r2.dept_id from public.rotas r2 where r2.id = rota_shifts.rota_id)
              )
          )
        )
      )
    )
  );

create or replace function public.rota_enqueue_notification_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
  sid uuid;
  oid uuid;
  rs uuid;
  st text;
begin
  if tg_op = 'INSERT' then
    ev := 'shift_created';
    sid := new.id;
    oid := new.org_id;
    rs := new.rota_id;
  elsif tg_op = 'UPDATE' then
    ev := 'shift_updated';
    sid := new.id;
    oid := new.org_id;
    rs := new.rota_id;
  else
    ev := 'shift_deleted';
    sid := old.id;
    oid := old.org_id;
    rs := old.rota_id;
  end if;

  if rs is not null then
    select r.status into st from public.rotas r where r.id = rs;
    if st = 'draft' then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  end if;

  insert into public.rota_notification_jobs (org_id, event_type, rota_shift_id, payload)
  values (
    oid,
    ev,
    sid,
    jsonb_build_object(
      'op', lower(tg_op),
      'shift_id', sid,
      'user_id', case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      'rota_id', case when tg_op = 'DELETE' then old.rota_id else new.rota_id end
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
