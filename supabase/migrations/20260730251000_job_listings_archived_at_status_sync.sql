-- Track archive timestamps on job listings and keep it aligned with status transitions.

alter table if exists public.job_listings
  add column if not exists archived_at timestamptz null;

comment on column public.job_listings.archived_at is
  'Timestamp when the listing entered archived status. Null when active/draft.';

create index if not exists job_listings_org_archived_at_idx
  on public.job_listings (org_id, archived_at desc nulls last);

create or replace function public.job_listings_sync_archived_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists job_listings_sync_archived_at_trg on public.job_listings;
create trigger job_listings_sync_archived_at_trg
  before insert or update of status, archived_at on public.job_listings
  for each row
  execute procedure public.job_listings_sync_archived_at();
