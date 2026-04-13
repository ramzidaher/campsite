alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at_trg on public.profiles;
create trigger profiles_updated_at_trg
  before update on public.profiles
  for each row
  execute procedure public.profiles_touch_updated_at();
