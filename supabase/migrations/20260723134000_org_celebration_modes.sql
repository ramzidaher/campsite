create table if not exists public.org_celebration_modes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  mode_key text not null,
  label text not null,
  is_enabled boolean not null default true,
  display_order integer not null default 100,
  auto_start_month smallint null,
  auto_start_day smallint null,
  auto_end_month smallint null,
  auto_end_day smallint null,
  gradient_override text null,
  emoji_primary text null,
  emoji_secondary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_celebration_modes_mode_key_check check (
    mode_key <> ''
    and (
      mode_key in (
        'off',
        'pride',
        'new_years_day',
        'valentines_day',
        'international_womens_day',
        'earth_day',
        'christmas',
        'easter',
        'good_friday',
        'palm_sunday',
        'hanukkah',
        'passover',
        'rosh_hashanah',
        'yom_kippur',
        'eid_al_fitr',
        'eid_al_adha',
        'ramadan',
        'diwali',
        'holi',
        'lunar_new_year',
        'vesak',
        'halloween',
        'thanksgiving',
        'black_friday',
        'mothers_day',
        'fathers_day',
        'boxing_day',
        'bonfire_night',
        'early_may_bank_holiday'
      )
      or mode_key like 'org_custom:%'
    )
  ),
  constraint org_celebration_modes_dates_check check (
    (
      auto_start_month is null
      and auto_start_day is null
      and auto_end_month is null
      and auto_end_day is null
    )
    or (
      auto_start_month between 1 and 12
      and auto_end_month between 1 and 12
      and auto_start_day between 1 and 31
      and auto_end_day between 1 and 31
    )
  ),
  constraint org_celebration_modes_unique_org_mode unique (org_id, mode_key)
);

create index if not exists org_celebration_modes_org_idx
  on public.org_celebration_modes (org_id, display_order, label);

create or replace function public.set_org_celebration_modes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_org_celebration_modes_updated_at on public.org_celebration_modes;
create trigger trg_org_celebration_modes_updated_at
before update on public.org_celebration_modes
for each row
execute procedure public.set_org_celebration_modes_updated_at();

alter table public.org_celebration_modes enable row level security;

drop policy if exists org_celebration_modes_select_own_org on public.org_celebration_modes;
create policy org_celebration_modes_select_own_org
  on public.org_celebration_modes
  for select
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists org_celebration_modes_mutate_org_admin on public.org_celebration_modes;
create policy org_celebration_modes_mutate_org_admin
  on public.org_celebration_modes
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission((select auth.uid()), org_id, 'roles.manage', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission((select auth.uid()), org_id, 'roles.manage', '{}'::jsonb)
  );

alter table public.profiles
  drop constraint if exists profiles_celebration_mode_check;

alter table public.profiles
  add constraint profiles_celebration_mode_check
  check (
    celebration_mode in (
      'off',
      'pride',
      'new_years_day',
      'valentines_day',
      'international_womens_day',
      'earth_day',
      'christmas',
      'easter',
      'good_friday',
      'palm_sunday',
      'hanukkah',
      'passover',
      'rosh_hashanah',
      'yom_kippur',
      'eid_al_fitr',
      'eid_al_adha',
      'ramadan',
      'diwali',
      'holi',
      'lunar_new_year',
      'vesak',
      'halloween',
      'thanksgiving',
      'black_friday',
      'mothers_day',
      'fathers_day',
      'boxing_day',
      'bonfire_night',
      'early_may_bank_holiday'
    )
    or celebration_mode like 'org_custom:%'
  );
