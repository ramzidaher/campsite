-- Phase 3: org default timezone (IANA); Sheets import target rota on mappings + sync log.

alter table public.organisations
  add column if not exists timezone text;

comment on column public.organisations.timezone is
  'IANA timezone name (e.g. Europe/London) for rota/calendar display; null = use viewer local time.';

alter table public.sheets_mappings
  add column if not exists target_rota_id uuid references public.rotas (id) on delete set null;

comment on column public.sheets_mappings.target_rota_id is
  'When set, Sheets import pipeline should attach imported rota_shifts to this rota (same org).';

create or replace function public.sheets_mappings_target_rota_org_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_org uuid;
begin
  if new.target_rota_id is null then
    return new;
  end if;
  select r.org_id into r_org from public.rotas r where r.id = new.target_rota_id;
  if r_org is null or r_org <> new.org_id then
    raise exception 'sheets_mappings.target_rota_id must reference a rota in the same organisation';
  end if;
  return new;
end;
$$;

drop trigger if exists sheets_mappings_target_rota_org on public.sheets_mappings;
create trigger sheets_mappings_target_rota_org
  before insert or update of target_rota_id, org_id on public.sheets_mappings
  for each row
  execute procedure public.sheets_mappings_target_rota_org_fn();

alter table public.rota_sheets_sync_log
  add column if not exists target_rota_id uuid references public.rotas (id) on delete set null;

comment on column public.rota_sheets_sync_log.target_rota_id is
  'Rota selected for that sync run (snapshot; importer should set rota_shifts.rota_id when writing rows).';
