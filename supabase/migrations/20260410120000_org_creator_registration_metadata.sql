-- First org admin self-serve (creates tenant). Not platform founders — those use platform_admins / Founder HQ.
-- Prefer user_metadata keys register_create_org_*; still accept register_founder_* for backward compatibility.

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

  -- New organisation + active org_admin (first admin for that tenant)
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

    insert into public.profiles (id, org_id, full_name, email, role, status)
    values (p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active');

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

  insert into public.profiles (id, org_id, full_name, email, role, status)
  values (p_user_id, v_org, v_full, nullif(trim(p_email), ''), 'unassigned', 'pending');

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
