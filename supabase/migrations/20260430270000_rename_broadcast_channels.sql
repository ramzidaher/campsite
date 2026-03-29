-- Align schema with product language: dept_categories → broadcast_channels, cat_id → channel_id.
-- Recreates RLS and functions that referenced old names.

-- ---------------------------------------------------------------------------
-- Drop policies that embed old identifiers
-- ---------------------------------------------------------------------------

drop policy if exists dept_categories_select_anon on public.dept_categories;
drop policy if exists dept_categories_select_auth on public.dept_categories;
drop policy if exists dept_categories_mutate_org_admin on public.dept_categories;
drop policy if exists dept_categories_mutate_super_admin on public.dept_categories;

drop policy if exists user_subscriptions_select on public.user_subscriptions;

-- ---------------------------------------------------------------------------
-- Rename columns and table
-- ---------------------------------------------------------------------------

alter table public.broadcasts rename column cat_id to channel_id;
alter table public.user_subscriptions rename column cat_id to channel_id;

alter table public.dept_categories rename to broadcast_channels;

-- ---------------------------------------------------------------------------
-- Indexes and FK constraint names (cosmetic; column rename does not rename all constraints)
-- ---------------------------------------------------------------------------

alter index if exists public.dept_categories_dept_id_idx rename to broadcast_channels_dept_id_idx;
alter index if exists public.broadcasts_cat_id_idx rename to broadcasts_channel_id_idx;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.broadcasts'::regclass and conname = 'broadcasts_cat_id_fkey'
  ) then
    alter table public.broadcasts rename constraint broadcasts_cat_id_fkey to broadcasts_channel_id_fkey;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_subscriptions'::regclass and conname = 'user_subscriptions_cat_id_fkey'
  ) then
    alter table public.user_subscriptions rename constraint user_subscriptions_cat_id_fkey to user_subscriptions_channel_id_fkey;
  end if;
end $$;

alter table public.broadcasts drop constraint if exists broadcasts_org_wide_delivery_check;

alter table public.broadcasts
  add constraint broadcasts_org_wide_delivery_check
  check (
    (coalesce(is_org_wide, false) = true and channel_id is null and team_id is null)
    or (coalesce(is_org_wide, false) = false and channel_id is not null)
  );

comment on table public.broadcast_channels is
  'Per-department broadcast channels (audience lists). Formerly dept_categories.';

-- ---------------------------------------------------------------------------
-- broadcasts_validate_fn
-- ---------------------------------------------------------------------------

create or replace function public.broadcasts_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_org uuid;
  c_dept uuid;
  t_dept uuid;
  p_org uuid;
begin
  select d.org_id into d_org from public.departments d where d.id = new.dept_id;
  if d_org is null then
    raise exception 'Invalid department';
  end if;
  if new.org_id <> d_org then
    raise exception 'org_id must match department organisation';
  end if;

  if coalesce(new.is_org_wide, false) then
    if new.channel_id is not null then
      raise exception 'Org-wide broadcasts must not set a channel';
    end if;
    if new.team_id is not null then
      raise exception 'Org-wide broadcasts must not set a team';
    end if;
  else
    if new.channel_id is null then
      raise exception 'Channel required unless broadcast is org-wide';
    end if;
    select c.dept_id into c_dept from public.broadcast_channels c where c.id = new.channel_id;
    if c_dept is null or c_dept <> new.dept_id then
      raise exception 'Channel must belong to the selected department';
    end if;
    if new.team_id is not null then
      select dt.dept_id into t_dept from public.dept_teams dt where dt.id = new.team_id;
      if t_dept is null or t_dept <> new.dept_id then
        raise exception 'Team must belong to the selected department';
      end if;
    end if;
  end if;

  select p.org_id into p_org from public.profiles p where p.id = new.created_by;
  if p_org is null or p_org <> new.org_id then
    raise exception 'Creator must belong to the same organisation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_should_receive_sent_broadcast
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
      from public.user_dept_teams udt
      where udt.user_id = p_user_id
        and udt.team_id = b.team_id
    ) then
      return false;
    end if;
  end if;

  if b.channel_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.channel_id = b.channel_id
      and us.subscribed = true
  );
end;
$$;

revoke all on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) from public;
grant execute on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) to service_role;

-- ---------------------------------------------------------------------------
-- org_admin_remove_member
-- ---------------------------------------------------------------------------

create or replace function public.org_admin_remove_member(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  v_viewer_role text;
  v_viewer_status text;
  v_target_org uuid;
  v_target_role text;
  v_org_admin_count int;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select org_id, role, status
  into v_org, v_viewer_role, v_viewer_status
  from public.profiles
  where id = v_viewer;

  if v_org is null
    or v_viewer_status is distinct from 'active'
    or v_viewer_role not in ('org_admin', 'super_admin')
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_target = v_viewer then
    raise exception 'cannot remove yourself from the organisation';
  end if;

  select org_id, role
  into v_target_org, v_target_role
  from public.profiles
  where id = p_target;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_target_org is null then
    raise exception 'user is not a member of an organisation';
  end if;

  if v_target_org is distinct from v_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_target_role in ('org_admin', 'super_admin') then
    select count(*)::int
    into v_org_admin_count
    from public.profiles
    where org_id = v_org
      and role in ('org_admin', 'super_admin');

    if v_org_admin_count <= 1 then
      raise exception 'cannot remove the last org admin for this organisation';
    end if;
  end if;

  delete from public.user_departments ud
  using public.departments d
  where ud.user_id = p_target
    and ud.dept_id = d.id
    and d.org_id = v_org;

  delete from public.dept_managers dm
  using public.departments d
  where dm.user_id = p_target
    and dm.dept_id = d.id
    and d.org_id = v_org;

  delete from public.user_subscriptions us
  using public.broadcast_channels c
  join public.departments d on d.id = c.dept_id
  where us.user_id = p_target
    and us.channel_id = c.id
    and d.org_id = v_org;

  delete from public.broadcast_reads br
  using public.broadcasts b
  where br.user_id = p_target
    and br.broadcast_id = b.id
    and b.org_id = v_org;

  delete from public.rota_shifts
  where org_id = v_org
    and user_id = p_target;

  update public.profiles
  set
    org_id = null,
    role = 'unassigned',
    status = 'inactive',
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

revoke all on function public.org_admin_remove_member(uuid) from public;
grant execute on function public.org_admin_remove_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_registration_from_user_meta (accept channel_id or legacy cat_id in JSON)
-- ---------------------------------------------------------------------------

create or replace function public.apply_registration_from_user_meta(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_org_text text;
  v_full text;
  v_avatar text;
  v_depts jsonb;
  v_subs jsonb;
  dept_count int;
  valid_dept_count int;
  v_create_org_name text;
  v_create_slug_raw text;
  v_slug text;
  v_new_org_id uuid;
  v_dept_id uuid;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  v_avatar := nullif(trim(coalesce(p_meta->>'register_avatar_url', '')), '');
  if v_avatar is not null and length(v_avatar) > 2048 then
    v_avatar := null;
  end if;

  v_org_text := nullif(trim(coalesce(p_meta->>'register_org_id', '')), '');
  v_create_org_name := nullif(trim(coalesce(
    p_meta->>'register_create_org_name',
    p_meta->>'register_founder_org_name',
    ''
  )), '');
  v_create_slug_raw := nullif(trim(coalesce(
    p_meta->>'register_create_org_slug',
    p_meta->>'register_founder_org_slug',
    ''
  )), '');

  v_org := null;
  if v_org_text is not null then
    begin
      v_org := v_org_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid organisation reference in registration';
    end;
  end if;

  if v_org is not null and v_create_org_name is not null and v_create_slug_raw is not null then
    raise exception 'Invalid registration: choose either joining an organisation or creating one, not both';
  end if;

  if v_create_org_name is not null and v_create_slug_raw is not null then
    if length(v_create_org_name) > 120 or length(v_create_org_name) < 1 then
      raise exception 'Organisation name must be between 1 and 120 characters';
    end if;

    v_slug := lower(v_create_slug_raw);
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '-+', '-', 'g');
    v_slug := trim(both '-' from v_slug);

    if length(v_slug) < 2 or length(v_slug) > 63 then
      raise exception 'Choose a URL slug between 2 and 63 characters (lowercase letters, numbers, hyphens)';
    end if;

    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Choose a URL slug using lowercase letters, numbers, and hyphens only';
    end if;

    if exists (select 1 from public.organisations o where o.slug = v_slug) then
      raise exception 'That organisation URL is already taken. Choose a different slug';
    end if;

    v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

    insert into public.organisations (name, slug, is_active)
    values (v_create_org_name, v_slug, true)
    returning id into v_new_org_id;

    insert into public.departments (org_id, name, type, is_archived)
    values (v_new_org_id, 'General', 'department', false)
    returning id into v_dept_id;

    insert into public.profiles (id, org_id, full_name, email, role, status, avatar_url)
    values (p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active', v_avatar);

    insert into public.user_departments (user_id, dept_id)
    values (p_user_id, v_dept_id);

    return;
  end if;

  if v_org is null then
    return;
  end if;

  if not exists (
    select 1 from public.organisations o where o.id = v_org and o.is_active = true
  ) then
    raise exception 'Invalid organisation for registration';
  end if;

  v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

  begin
    v_depts := (p_meta->>'register_dept_ids')::jsonb;
  exception
    when others then
      raise exception 'Invalid registration department data';
  end;

  if v_depts is null or jsonb_typeof(v_depts) <> 'array' or jsonb_array_length(v_depts) = 0 then
    raise exception 'Select at least one team';
  end if;

  select count(*)::int into dept_count from jsonb_array_elements_text(v_depts) q(did);

  select count(*)::int into valid_dept_count
  from jsonb_array_elements_text(v_depts) q(did)
  join public.departments d on d.id = q.did::uuid
  where d.org_id = v_org and d.is_archived = false;

  if valid_dept_count <> dept_count then
    raise exception 'Invalid department for registration';
  end if;

  insert into public.profiles (id, org_id, full_name, email, role, status, avatar_url)
  values (p_user_id, v_org, v_full, nullif(trim(p_email), ''), 'unassigned', 'pending', v_avatar);

  insert into public.user_departments (user_id, dept_id)
  select p_user_id, q.did::uuid
  from jsonb_array_elements_text(v_depts) q(did);

  begin
    v_subs := coalesce((p_meta->>'register_subscriptions')::jsonb, '[]'::jsonb);
  exception
    when others then
      v_subs := '[]'::jsonb;
  end;

  if jsonb_typeof(v_subs) = 'array' and jsonb_array_length(v_subs) > 0 then
    insert into public.user_subscriptions (user_id, channel_id, subscribed)
    select
      p_user_id,
      (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid,
      coalesce((s.item->>'subscribed')::boolean, true)
    from jsonb_array_elements(v_subs) s(item)
    where nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), '') is not null
      and exists (
        select 1
        from public.broadcast_channels c
        join public.departments d on d.id = c.dept_id
        where c.id = (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid
          and d.org_id = v_org
          and d.is_archived = false
          and d.id in (select q.did::uuid from jsonb_array_elements_text(v_depts) q(did))
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: broadcast_channels (same rules as former dept_categories)
-- ---------------------------------------------------------------------------

create policy broadcast_channels_select_anon
  on public.broadcast_channels
  for select
  to anon
  using (
    exists (
      select 1
      from public.departments d
      join public.organisations o on o.id = d.org_id
      where d.id = broadcast_channels.dept_id
        and d.is_archived = false
        and o.is_active = true
    )
  );

create policy broadcast_channels_select_auth
  on public.broadcast_channels
  for select
  to authenticated
  using (
    exists (
      select 1 from public.departments d
      where d.id = broadcast_channels.dept_id
        and (
          d.org_id = public.current_org_id()
          or (
            d.is_archived = false
            and exists (select 1 from public.organisations o where o.id = d.org_id and o.is_active = true)
          )
        )
    )
  );

create policy broadcast_channels_mutate_org_admin
  on public.broadcast_channels
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = broadcast_channels.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = broadcast_channels.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  );

create policy user_subscriptions_select
  on public.user_subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.broadcast_channels c
      join public.departments d on d.id = c.dept_id
      where c.id = user_subscriptions.channel_id
        and d.org_id = public.current_org_id()
    )
  );
