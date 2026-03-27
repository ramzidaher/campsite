-- Self-service deactivation from settings: allow active → inactive on own row; still block role changes and other status edits.

create or replace function public.profiles_block_self_role_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'update' and new.id = old.id and new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'Cannot change role on your own profile';
    end if;
    if new.status is distinct from old.status then
      if not (old.status = 'active' and new.status = 'inactive') then
        raise exception 'Cannot change status on your own profile';
      end if;
    end if;
  end if;
  return new;
end;
$$;
