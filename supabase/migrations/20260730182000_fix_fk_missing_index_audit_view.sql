-- Fix db_fk_missing_index_audit view false positives.
-- pg_index.indkey arrays can have 0-based lower bounds; normalize using text split.

create or replace view public.db_fk_missing_index_audit as
with fk_cols as (
  select
    c.oid as constraint_oid,
    ns.nspname as schema_name,
    rel.relname as table_name,
    rel.oid as relid,
    c.conname as constraint_name,
    c.conkey as fk_attnums
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where c.contype = 'f'
    and ns.nspname = 'public'
),
idx as (
  select
    i.indrelid as relid,
    array_remove(string_to_array(i.indkey::text, ' '), '')::smallint[] as indkey_arr,
    i.indisvalid as is_valid,
    i.indisready as is_ready
  from pg_index i
)
select
  fk.schema_name,
  fk.table_name,
  fk.constraint_name,
  (
    select string_agg(a.attname, ', ' order by x.ord)
    from unnest(fk.fk_attnums) with ordinality as x(attnum, ord)
    join pg_attribute a on a.attrelid = fk.relid and a.attnum = x.attnum
  ) as fk_columns
from fk_cols fk
where not exists (
  select 1
  from idx i
  where i.relid = fk.relid
    and i.is_valid
    and i.is_ready
    and cardinality(i.indkey_arr) >= cardinality(fk.fk_attnums)
    and i.indkey_arr[1:cardinality(fk.fk_attnums)] = fk.fk_attnums
)
order by fk.table_name, fk.constraint_name;
