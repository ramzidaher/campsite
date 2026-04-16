alter table public.profiles
  alter column ui_mode set default 'classic';

alter table public.profiles
  drop constraint if exists profiles_ui_mode_check;

update public.profiles
set ui_mode = case
  when ui_mode = 'gen_z' then 'interactive'
  when ui_mode = 'millennial' then 'classic'
  when ui_mode in ('classic', 'interactive') then ui_mode
  else 'classic'
end;

alter table public.profiles
  add constraint profiles_ui_mode_check
  check (ui_mode in ('classic', 'interactive'));
