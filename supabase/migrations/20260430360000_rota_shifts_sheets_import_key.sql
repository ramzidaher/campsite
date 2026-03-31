-- Idempotent Sheets import: stable key per org for upsert semantics.

alter table public.rota_shifts
  add column if not exists sheets_import_key text;

comment on column public.rota_shifts.sheets_import_key is
  'Stable key from Sheets import (e.g. spreadsheet:sheet:row); unique per org when set.';

create unique index if not exists rota_shifts_org_sheets_import_key_uidx
  on public.rota_shifts (org_id, sheets_import_key)
  where sheets_import_key is not null;
