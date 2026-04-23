-- Introspection views to operationalize FK delete-policy and FK-index audits.
-- Read-only metadata; no data-path behavior changes.

create or replace view public.db_fk_delete_action_audit as
with fks as (
  select
    c.oid as constraint_oid,
    ns_child.nspname as child_schema,
    child.relname as child_table,
    ns_parent.nspname as parent_schema,
    parent.relname as parent_table,
    c.conname as constraint_name,
    c.conkey as child_attnums,
    c.confdeltype as delete_action_code
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_namespace ns_child on ns_child.oid = child.relnamespace
  join pg_class parent on parent.oid = c.confrelid
  join pg_namespace ns_parent on ns_parent.oid = parent.relnamespace
  where c.contype = 'f'
    and ns_child.nspname = 'public'
    and ns_parent.nspname = 'public'
)
select
  f.constraint_name,
  f.child_schema,
  f.child_table,
  f.parent_schema,
  f.parent_table,
  case f.delete_action_code
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else 'UNKNOWN'
  end as on_delete_action,
  (
    select string_agg(a.attname, ', ' order by x.ord)
    from unnest(f.child_attnums) with ordinality as x(attnum, ord)
    join pg_attribute a on a.attrelid = (
      select oid from pg_class where relname = f.child_table and relnamespace = (
        select oid from pg_namespace where nspname = f.child_schema
      )
    ) and a.attnum = x.attnum
  ) as child_columns
from fks f
order by f.child_table, f.constraint_name;

create or replace view public.db_fk_missing_index_audit as
with fk_cols as (
  select
    c.oid as constraint_oid,
    ns.nspname as schema_name,
    rel.relname as table_name,
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
    i.indkey::int2[] as indkey,
    i.indisvalid as is_valid,
    i.indisready as is_ready
  from pg_index i
),
fk_with_rel as (
  select
    fk.*,
    rel.oid as relid
  from fk_cols fk
  join pg_class rel on rel.relname = fk.table_name
  join pg_namespace ns on ns.oid = rel.relnamespace and ns.nspname = fk.schema_name
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
from fk_with_rel fk
where not exists (
  select 1
  from idx i
  where i.relid = fk.relid
    and i.is_valid
    and i.is_ready
    and i.indkey[1:cardinality(fk.fk_attnums)] = fk.fk_attnums
)
order by fk.table_name, fk.constraint_name;
