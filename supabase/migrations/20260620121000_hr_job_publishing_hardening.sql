-- HR publishing hardening and minimal public analytics counters.

create or replace function public.job_listings_ensure_published_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'live' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists job_listings_ensure_published_at_trg on public.job_listings;
create trigger job_listings_ensure_published_at_trg
  before insert or update of status, published_at on public.job_listings
  for each row
  execute procedure public.job_listings_ensure_published_at();

create table if not exists public.job_listing_public_metrics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_listing_id uuid not null references public.job_listings (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'apply_start', 'apply_submit')),
  created_at timestamptz not null default now()
);

create index if not exists job_listing_public_metrics_lookup_idx
  on public.job_listing_public_metrics (org_id, job_listing_id, event_type, created_at desc);

create or replace function public.track_public_job_metric(
  p_org_slug text,
  p_job_slug text,
  p_event_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_job_id uuid;
begin
  if p_event_type not in ('impression', 'apply_start', 'apply_submit') then
    raise exception 'invalid event type';
  end if;

  select o.id, jl.id into v_org_id, v_job_id
  from public.organisations o
  join public.job_listings jl on jl.org_id = o.id
  where o.slug = nullif(trim(p_org_slug), '')
    and o.is_active = true
    and jl.slug = nullif(trim(p_job_slug), '')
    and jl.status = 'live';

  if v_org_id is null or v_job_id is null then
    return;
  end if;

  insert into public.job_listing_public_metrics (org_id, job_listing_id, event_type)
  values (v_org_id, v_job_id, p_event_type);
end;
$$;

grant execute on function public.track_public_job_metric(text, text, text) to anon, authenticated;
