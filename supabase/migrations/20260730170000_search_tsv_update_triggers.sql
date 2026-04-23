-- Keep full-text search vectors current on UPDATE for key tables.
-- Existing schema uses DEFAULT expressions, which only apply on INSERT.

create or replace function public.broadcasts_set_search_tsv_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.body, '')), 'B');
  return new;
end;
$$;

do $$
declare
  v_generated text;
begin
  select a.attgenerated
  into v_generated
  from pg_attribute a
  where a.attrelid = 'public.broadcasts'::regclass
    and a.attname = 'search_tsv'
    and not a.attisdropped;

  -- If generated column exists, it auto-updates and no trigger is needed.
  if coalesce(v_generated, '') = '' then
    drop trigger if exists broadcasts_set_search_tsv_trg on public.broadcasts;
    create trigger broadcasts_set_search_tsv_trg
    before insert or update of title, body
    on public.broadcasts
    for each row
    execute function public.broadcasts_set_search_tsv_trg_fn();
  else
    drop trigger if exists broadcasts_set_search_tsv_trg on public.broadcasts;
  end if;
end $$;

create or replace function public.staff_resources_set_search_tsv_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  return new;
end;
$$;

do $$
declare
  v_generated text;
begin
  select a.attgenerated
  into v_generated
  from pg_attribute a
  where a.attrelid = 'public.staff_resources'::regclass
    and a.attname = 'search_tsv'
    and not a.attisdropped;

  -- If generated column exists, it auto-updates and no trigger is needed.
  if coalesce(v_generated, '') = '' then
    drop trigger if exists staff_resources_set_search_tsv_trg on public.staff_resources;
    create trigger staff_resources_set_search_tsv_trg
    before insert or update of title, description
    on public.staff_resources
    for each row
    execute function public.staff_resources_set_search_tsv_trg_fn();
  else
    drop trigger if exists staff_resources_set_search_tsv_trg on public.staff_resources;
  end if;
end $$;
