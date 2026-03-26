-- Complete self-registration when org/teams are stored in auth user metadata.
-- Runs as security definer so it succeeds even when email confirmation leaves the client without a session.

create or replace function public.handle_auth_user_registration()
returns trigger
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
  v_org := nullif(trim(coalesce(new.raw_user_meta_data->>'register_org_id', '')), '')::uuid;
  if v_org is null then
    return new;
  end if;

  if not exists (
    select 1 from public.organisations o where o.id = v_org and o.is_active = true
  ) then
    raise exception 'Invalid organisation for registration';
  end if;

  v_full := coalesce(nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''), 'Member');

  begin
    v_depts := (new.raw_user_meta_data->>'register_dept_ids')::jsonb;
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
  values (new.id, v_org, v_full, new.email, 'csa', 'pending');

  insert into public.user_departments (user_id, dept_id)
  select new.id, q.did::uuid
  from jsonb_array_elements_text(v_depts) q(did);

  begin
    v_subs := coalesce((new.raw_user_meta_data->>'register_subscriptions')::jsonb, '[]'::jsonb);
  exception
    when others then
      v_subs := '[]'::jsonb;
  end;

  if jsonb_typeof(v_subs) = 'array' and jsonb_array_length(v_subs) > 0 then
    insert into public.user_subscriptions (user_id, cat_id, subscribed)
    select
      new.id,
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_registration on auth.users;

create trigger on_auth_user_registration
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_registration();
