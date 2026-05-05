-- Calendarific shared cache (server role only) + org celebration country defaults.

alter table public.organisations
  add column if not exists celebration_holiday_country text not null default 'GB',
  add column if not exists celebration_holidays_last_synced_at timestamptz null;

comment on column public.organisations.celebration_holiday_country is
  'ISO 3166-1 alpha-2 country code for public holiday lookup (Calendarific). Default GB (United Kingdom).';

comment on column public.organisations.celebration_holidays_last_synced_at is
  'Last successful Calendarific sync that refreshed celebration date windows for this org.';

alter table public.organisations
  drop constraint if exists organisations_celebration_holiday_country_check;

alter table public.organisations
  add constraint organisations_celebration_holiday_country_check
  check (
    celebration_holiday_country ~ '^[A-Za-z]{2}$'
  );

create table if not exists public.calendarific_holidays_cache (
  country text not null,
  year smallint not null,
  holidays jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (country, year)
);

create index if not exists calendarific_holidays_cache_fetched_at_idx
  on public.calendarific_holidays_cache (fetched_at desc);

comment on table public.calendarific_holidays_cache is
  'Shared Calendarific API response cache by country and year. Written only by service role from Next.js.';

alter table public.calendarific_holidays_cache enable row level security;

revoke all on table public.calendarific_holidays_cache from public;
revoke all on table public.calendarific_holidays_cache from anon, authenticated;
grant select, insert, update, delete on table public.calendarific_holidays_cache to service_role;
