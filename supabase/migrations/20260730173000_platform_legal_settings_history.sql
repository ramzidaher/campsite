-- Add versioned history for platform_legal_settings.
-- Captures every insert/update as immutable snapshot rows for compliance/audit.

create table if not exists public.platform_legal_settings_history (
  id uuid primary key default gen_random_uuid(),
  legal_settings_id smallint not null references public.platform_legal_settings(id) on delete cascade,
  bundle_version text not null,
  effective_label text not null,
  terms_markdown text not null default '',
  privacy_markdown text not null default '',
  data_processing_markdown text not null default '',
  source_updated_at timestamptz not null,
  source_updated_by uuid references auth.users(id),
  captured_at timestamptz not null default now()
);

create index if not exists platform_legal_settings_history_legal_id_captured_idx
  on public.platform_legal_settings_history (legal_settings_id, captured_at desc);

create index if not exists platform_legal_settings_history_bundle_idx
  on public.platform_legal_settings_history (bundle_version);

create or replace function public.capture_platform_legal_settings_history_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.platform_legal_settings_history (
    legal_settings_id,
    bundle_version,
    effective_label,
    terms_markdown,
    privacy_markdown,
    data_processing_markdown,
    source_updated_at,
    source_updated_by
  )
  values (
    new.id,
    new.bundle_version,
    new.effective_label,
    new.terms_markdown,
    new.privacy_markdown,
    new.data_processing_markdown,
    new.updated_at,
    new.updated_by
  );

  return new;
end;
$$;

drop trigger if exists platform_legal_settings_history_capture_trg on public.platform_legal_settings;
create trigger platform_legal_settings_history_capture_trg
after insert or update
on public.platform_legal_settings
for each row
execute function public.capture_platform_legal_settings_history_trg_fn();

-- Backfill current singleton row into history table once.
insert into public.platform_legal_settings_history (
  legal_settings_id,
  bundle_version,
  effective_label,
  terms_markdown,
  privacy_markdown,
  data_processing_markdown,
  source_updated_at,
  source_updated_by,
  captured_at
)
select
  p.id,
  p.bundle_version,
  p.effective_label,
  p.terms_markdown,
  p.privacy_markdown,
  p.data_processing_markdown,
  p.updated_at,
  p.updated_by,
  now()
from public.platform_legal_settings p
where not exists (
  select 1
  from public.platform_legal_settings_history h
  where h.legal_settings_id = p.id
);
