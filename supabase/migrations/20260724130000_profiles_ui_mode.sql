alter table public.profiles
  add column if not exists ui_mode text not null default 'millennial';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ui_mode_check'
  ) then
    alter table public.profiles
      add constraint profiles_ui_mode_check
      check (ui_mode in ('millennial', 'gen_z'));
  end if;
end
$$;

update public.profiles
set ui_mode = 'millennial'
where ui_mode is null;
