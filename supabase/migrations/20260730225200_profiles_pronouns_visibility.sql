-- Optional pronouns + visibility preference for account onboarding and profile surfaces.

alter table public.profiles
  add column if not exists pronouns text;

alter table public.profiles
  add column if not exists show_pronouns boolean not null default false;

comment on column public.profiles.pronouns is
  'Optional self-declared pronouns (e.g. she/her, they/them).';

comment on column public.profiles.show_pronouns is
  'When true, pronouns can be displayed on profile surfaces.';

create or replace function public.sync_my_registration_pronouns(
  p_pronouns text default null,
  p_show_pronouns boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pronouns text;
  v_show boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_pronouns := nullif(trim(coalesce(p_pronouns, '')), '');
  v_show := p_show_pronouns;

  if v_pronouns is null or v_show is null then
    select
      case
        when v_pronouns is not null then v_pronouns
        else nullif(trim(coalesce(u.raw_user_meta_data->>'register_pronouns', '')), '')
      end,
      case
        when v_show is not null then v_show
        else coalesce((u.raw_user_meta_data->>'register_show_pronouns')::boolean, false)
      end
    into v_pronouns, v_show
    from auth.users u
    where u.id = auth.uid();
  end if;

  if v_pronouns is not null and length(v_pronouns) > 80 then
    v_pronouns := left(v_pronouns, 80);
  end if;

  update public.profiles
  set
    pronouns = v_pronouns,
    show_pronouns = coalesce(v_show, false)
  where id = auth.uid();
end;
$$;

revoke all on function public.sync_my_registration_pronouns(text, boolean) from public;
grant execute on function public.sync_my_registration_pronouns(text, boolean) to authenticated;
