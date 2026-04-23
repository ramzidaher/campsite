-- Non-breaking type hardening for discount_tiers.
-- Keep legacy text columns in place while introducing typed columns:
-- - discount_value_pct numeric(5,2)
-- - valid_on daterange

create or replace function public.try_parse_discount_percent(p_text text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_text, '')), '');
  n numeric;
begin
  if v is null then
    return null;
  end if;

  -- Accept formats like "10", "10%", "10.5", "10.5 %"
  v := replace(v, '%', '');
  v := trim(v);
  if v !~ '^[0-9]+(\.[0-9]+)?$' then
    return null;
  end if;

  n := v::numeric;
  if n < 0 or n > 100 then
    return null;
  end if;
  return n;
end;
$$;

create or replace function public.try_parse_valid_at_range(p_text text)
returns daterange
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_text, '')), '');
  d1 date;
  d2 date;
begin
  if v is null then
    return null;
  end if;

  -- 1) ISO date range: YYYY-MM-DD to YYYY-MM-DD
  if v ~* '^\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}$' then
    d1 := split_part(v, ' to ', 1)::date;
    d2 := split_part(v, ' to ', 2)::date;
    if d2 < d1 then
      return null;
    end if;
    -- Inclusive end for users: store as half-open [start, end+1).
    return daterange(d1, d2 + 1, '[)');
  end if;

  -- 2) Single ISO date: YYYY-MM-DD (one-day range).
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    d1 := v::date;
    return daterange(d1, d1 + 1, '[)');
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

alter table public.discount_tiers
  add column if not exists discount_value_pct numeric(5,2),
  add column if not exists valid_on daterange;

comment on column public.discount_tiers.discount_value_pct is
  'Typed discount percentage 0..100 derived from discount_value text.';

comment on column public.discount_tiers.valid_on is
  'Typed validity window derived from valid_at text when parseable.';

-- Backfill typed columns from existing text values.
update public.discount_tiers
set
  discount_value_pct = public.try_parse_discount_percent(discount_value),
  valid_on = public.try_parse_valid_at_range(valid_at)
where discount_value_pct is null
   or valid_on is null;

-- Guard typed values for new writes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'discount_tiers_discount_value_pct_bounds_chk'
  ) then
    alter table public.discount_tiers
      add constraint discount_tiers_discount_value_pct_bounds_chk
      check (
        discount_value_pct is null
        or (discount_value_pct >= 0 and discount_value_pct <= 100)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'discount_tiers_valid_on_nonempty_chk'
  ) then
    alter table public.discount_tiers
      add constraint discount_tiers_valid_on_nonempty_chk
      check (
        valid_on is null
        or lower(valid_on) < upper(valid_on)
      ) not valid;
  end if;
end $$;

alter table public.discount_tiers
  validate constraint discount_tiers_discount_value_pct_bounds_chk;

alter table public.discount_tiers
  validate constraint discount_tiers_valid_on_nonempty_chk;

-- Performance helpers for typed lookups.
create index if not exists discount_tiers_org_discount_pct_idx
  on public.discount_tiers (org_id, discount_value_pct)
  where discount_value_pct is not null;

create index if not exists discount_tiers_valid_on_gist_idx
  on public.discount_tiers using gist (valid_on)
  where valid_on is not null;
