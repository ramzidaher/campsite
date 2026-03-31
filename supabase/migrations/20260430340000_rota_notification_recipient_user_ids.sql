-- Service-role RPC: who should receive push for a row in rota_notification_jobs.

create or replace function public.rota_notification_recipient_user_ids(p_job_id uuid)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  j record;
  cr record;
  assignee uuid;
  rid uuid;
begin
  select * into j from public.rota_notification_jobs where id = p_job_id;
  if not found then
    return;
  end if;

  if j.event_type in ('shift_created', 'shift_updated', 'shift_deleted') then
    assignee := null;
    if j.payload ? 'user_id' and jsonb_typeof(j.payload->'user_id') = 'string' then
      begin
        assignee := (j.payload->>'user_id')::uuid;
      exception when others then
        assignee := null;
      end;
    end if;

    rid := null;
    if j.payload ? 'rota_id' and j.payload->'rota_id' is not null and jsonb_typeof(j.payload->'rota_id') <> 'null' then
      begin
        rid := (j.payload->>'rota_id')::uuid;
      exception when others then
        rid := null;
      end;
    end if;

    return query
    select distinct u.uid
    from (
      select assignee as uid
      where assignee is not null
        and exists (
          select 1 from public.profiles p
          where p.id = assignee and p.org_id = j.org_id and p.status = 'active'
        )
      union all
      select r.owner_id
      from public.rotas r
      where rid is not null and r.id = rid and r.org_id = j.org_id
        and exists (
          select 1 from public.profiles p
          where p.id = r.owner_id and p.status = 'active'
        )
      union all
      select m.user_id
      from public.rota_members m
      where rid is not null and m.rota_id = rid
        and exists (
          select 1 from public.profiles p
          where p.id = m.user_id and p.org_id = j.org_id and p.status = 'active'
        )
    ) u
    where u.uid is not null;
    return;
  end if;

  if j.change_request_id is null then
    return;
  end if;

  select * into cr from public.rota_change_requests where id = j.change_request_id;
  if not found then
    return;
  end if;

  if j.event_type = 'request_created' then
    if cr.request_type = 'swap' and cr.status = 'pending_peer' and cr.counterparty_user_id is not null then
      return query
      select cr.counterparty_user_id
      where exists (
        select 1 from public.profiles p
        where p.id = cr.counterparty_user_id and p.org_id = j.org_id and p.status = 'active'
      );
    elsif cr.request_type = 'change' and cr.status = 'pending_final' then
      return query
      select p.id
      from public.profiles p
      where p.org_id = j.org_id
        and p.status = 'active'
        and p.role in ('manager', 'duty_manager', 'org_admin', 'super_admin');
    end if;
    return;
  end if;

  if j.event_type = 'request_peer_accepted' then
    return query
    select p.id
    from public.profiles p
    where p.org_id = j.org_id
      and p.status = 'active'
      and p.role in ('manager', 'duty_manager', 'org_admin', 'super_admin');
    return;
  end if;

  if j.event_type = 'request_resolved' then
    return query
    select distinct u.uid
    from (
      select cr.requested_by as uid
      where exists (
        select 1 from public.profiles p
        where p.id = cr.requested_by and p.org_id = j.org_id and p.status = 'active'
      )
      union all
      select cr.counterparty_user_id
      where cr.counterparty_user_id is not null
        and exists (
          select 1 from public.profiles p
          where p.id = cr.counterparty_user_id and p.org_id = j.org_id and p.status = 'active'
        )
    ) u
    where u.uid is not null;
    return;
  end if;
end;
$$;

revoke all on function public.rota_notification_recipient_user_ids(uuid) from public;
grant execute on function public.rota_notification_recipient_user_ids(uuid) to service_role;

comment on function public.rota_notification_recipient_user_ids(uuid) is
  'Active profile IDs to notify for a rota_notification_jobs row; service_role only (Edge worker).';
