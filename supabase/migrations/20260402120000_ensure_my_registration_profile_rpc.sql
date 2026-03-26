-- Shared registration apply (trigger + repair RPC). Reads metadata from auth.users so it works
-- even when the client JWT omits custom user_metadata keys.

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
  v_full text;
  v_depts jsonb;
  v_subs jsonb;
  dept_count int;
  valid_dept_count int;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  v_org := nullif(trim(coalesce(p_meta->>'register_org_id', '')), '')::uuid;
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

  insert into public.profiles (id, org_id, full_name, email, role, status)
  values (p_user_id, v_org, v_full, p_email, 'csa', 'pending');

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
    insert into public.user_subscriptions (user_id, cat_id, subscribed)
    select
      p_user_id,
      (s.item->>'cat_id')::uuid,
      coalesce((s.item->>'subscribed')::boolean, true)
    from jsonb_array_elements(v_subs) s(item)
    where exists (
      select 1
      from public.dept_categories c
      join public.departments d on d.id = c.dept_id
      where c.id = (s.item->>'cat_id')::uuid
        and d.org_id = v_org
        and d.is_archived = false
        and d.id in (select q.did::uuid from jsonb_array_elements_text(v_depts) q(did))
    );
  end if;
end;
$$;

create or replace function public.handle_auth_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_registration_from_user_meta(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );
  return new;
end;
$$;

-- Call while authenticated; uses auth.users (authoritative metadata).
create or replace function public.ensure_my_registration_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_meta jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select u.email, u.raw_user_meta_data into v_email, v_meta
  from auth.users u
  where u.id = auth.uid();

  if not found then
    raise exception 'user not found';
  end if;

  perform public.apply_registration_from_user_meta(
    auth.uid(),
    v_email,
    coalesce(v_meta, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.ensure_my_registration_profile() to authenticated;
