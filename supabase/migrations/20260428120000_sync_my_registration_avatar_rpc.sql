-- Apply `register_avatar_url` from auth metadata (or an explicit URL) to `profiles.avatar_url`.
-- Security definer so it succeeds even if client-side profile updates hit RLS quirks.
-- When `p_url` is null, reads from `auth.users.raw_user_meta_data` and only fills an empty avatar.

create or replace function public.sync_my_registration_avatar(p_url text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_url := nullif(trim(coalesce(p_url, '')), '');
  if v_url is null then
    select nullif(trim(coalesce(u.raw_user_meta_data->>'register_avatar_url', '')), '')
    into v_url
    from auth.users u
    where u.id = auth.uid();
  end if;

  if v_url is null or length(v_url) > 2048 then
    return;
  end if;

  if v_url !~ '^https?://' then
    return;
  end if;

  if p_url is null then
    if exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and nullif(trim(coalesce(p.avatar_url, '')), '') is not null
    ) then
      return;
    end if;
  end if;

  update public.profiles
  set avatar_url = v_url
  where id = auth.uid();
end;
$$;

revoke all on function public.sync_my_registration_avatar(text) from public;
grant execute on function public.sync_my_registration_avatar(text) to authenticated;
