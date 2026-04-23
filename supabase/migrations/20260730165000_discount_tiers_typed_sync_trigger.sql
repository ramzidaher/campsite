-- Stage 2 for discount_tiers typed migration:
-- keep typed columns synchronized from legacy text writes automatically.

create or replace function public.discount_tiers_sync_typed_from_text_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Derive typed fields from legacy text inputs on every write.
  new.discount_value_pct := public.try_parse_discount_percent(new.discount_value);
  new.valid_on := public.try_parse_valid_at_range(new.valid_at);
  return new;
end;
$$;

drop trigger if exists discount_tiers_sync_typed_from_text_trg on public.discount_tiers;
create trigger discount_tiers_sync_typed_from_text_trg
before insert or update of discount_value, valid_at
on public.discount_tiers
for each row
execute function public.discount_tiers_sync_typed_from_text_trg_fn();

comment on function public.discount_tiers_sync_typed_from_text_trg_fn() is
  'Synchronizes discount_tiers typed columns from legacy text fields on insert/update.';
