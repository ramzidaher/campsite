-- Plan 02: single definition for “who should see a sent broadcast” (feed RLS + push fan-out).
-- Also: legacy super_admin may target a department like org_admin.

-- ---------------------------------------------------------------------------
-- Core rule: sent broadcast visible / notify (mirrors former broadcast_visible_to_reader sent branch)
-- ---------------------------------------------------------------------------

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

  return (
    b.created_by = p_user_id
    or exists (
      select 1 from public.user_subscriptions us
      where us.user_id = p_user_id
        and us.cat_id = b.cat_id
        and us.subscribed = true
    )
    or exists (
      select 1 from public.profiles p
      where p.id = p_user_id
        and p.role in ('org_admin', 'super_admin')
    )
  );
end;
$$;

revoke all on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) from public;
grant execute on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) to service_role;

create or replace function public.broadcast_visible_to_reader(b public.broadcasts)
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
  select p.org_id, p.status into v_org, v_status
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_org <> b.org_id then
    return false;
  end if;

  if v_status <> 'active' and auth.uid() <> b.created_by then
    return false;
  end if;

  if b.status = 'sent' then
    return public.user_should_receive_sent_broadcast(auth.uid(), b);
  end if;

  if b.status = 'draft' then
    return b.created_by = auth.uid();
  end if;

  if b.status = 'pending_approval' then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = b.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('org_admin', 'super_admin')
      );
  end if;

  if b.status in ('scheduled', 'cancelled') then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('org_admin', 'super_admin')
      );
  end if;

  return false;
end;
$$;

-- Workers (Edge, cron)  same audience as the feed for sent posts.
create or replace function public.broadcast_notification_recipient_user_ids(p_broadcast_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  inner join public.broadcasts b on b.id = p_broadcast_id and b.status = 'sent'
  where p.org_id = b.org_id
    and p.status = 'active'
    and public.user_should_receive_sent_broadcast(p.id, b);
$$;

revoke all on function public.broadcast_notification_recipient_user_ids(uuid) from public;
grant execute on function public.broadcast_notification_recipient_user_ids(uuid) to service_role;

comment on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) is
  'Whether p_user_id should see broadcast b (sent only). Used by broadcast_visible_to_reader and notification fan-out.';
comment on function public.broadcast_notification_recipient_user_ids(uuid) is
  'Active org members who should receive push/email for a sent broadcast; service_role only.';

-- ---------------------------------------------------------------------------
-- super_admin: same department targeting as org_admin (align with isOrgAdminRole)
-- ---------------------------------------------------------------------------

create or replace function public.user_may_broadcast_to_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  d record;
begin
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_role is null then
    return false;
  end if;

  select d.* into d
  from public.departments d
  where d.id = p_dept_id;

  if not found then
    return false;
  end if;

  if d.org_id <> v_org then
    return false;
  end if;

  case v_role
    when 'org_admin', 'super_admin' then
      return true;
    when 'manager' then
      return exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
      );
    when 'coordinator' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'administrator', 'duty_manager', 'csa' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'society_leader' then
      return d.type in ('society', 'club')
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
        );
    else
      return false;
  end case;
end;
$$;
