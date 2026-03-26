-- Phase 4 — Staff discount tiers, QR token audit rows, verify rate limiting, scan logs.

-- ---------------------------------------------------------------------------
-- Discount tiers (one row per role per org)
-- ---------------------------------------------------------------------------

create table public.discount_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  role text not null check (
    role in (
      'super_admin',
      'senior_manager',
      'manager',
      'coordinator',
      'assistant',
      'weekly_paid',
      'society_leader'
    )
  ),
  label text not null,
  discount_value text,
  valid_at text,
  created_at timestamptz not null default now(),
  unique (org_id, role)
);

create index discount_tiers_org_idx on public.discount_tiers (org_id);

-- ---------------------------------------------------------------------------
-- Staff QR tokens (hash only — issued by Edge Function + service role)
-- ---------------------------------------------------------------------------

create table public.staff_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  issued_reason text not null check (issued_reason in ('auto', 'manual', 'login')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index staff_qr_tokens_user_idx on public.staff_qr_tokens (user_id);
create index staff_qr_tokens_expires_idx on public.staff_qr_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Scan audit trail (Super Admin reads; inserts via service role only)
-- ---------------------------------------------------------------------------

create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  scanner_id uuid not null references public.profiles (id) on delete cascade,
  scanned_user_id uuid references public.profiles (id) on delete set null,
  token_valid boolean not null,
  error_code text,
  scanned_display_name text,
  scanned_role text,
  scanned_department text,
  discount_label_snapshot text,
  created_at timestamptz not null default now()
);

create index scan_logs_org_created_idx on public.scan_logs (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Verification rate limit: max 30 requests per org per clock minute
-- ---------------------------------------------------------------------------

create table public.discount_verify_buckets (
  org_id uuid not null references public.organisations (id) on delete cascade,
  bucket_start timestamptz not null,
  hits int not null default 0,
  primary key (org_id, bucket_start)
);

-- Atomically increment per-org per-minute counter; returns true if still within limit (Edge / service_role).
create or replace function public.discount_verify_increment(
  p_org_id uuid,
  p_bucket timestamptz,
  p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_hits int;
begin
  insert into public.discount_verify_buckets (org_id, bucket_start, hits)
  values (p_org_id, p_bucket, 1)
  on conflict (org_id, bucket_start)
  do update set hits = public.discount_verify_buckets.hits + 1
  returning hits into new_hits;
  return new_hits <= p_limit;
end;
$$;

revoke all on function public.discount_verify_increment(uuid, timestamptz, int) from public;
grant execute on function public.discount_verify_increment to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.discount_tiers enable row level security;
alter table public.staff_qr_tokens enable row level security;
alter table public.scan_logs enable row level security;
alter table public.discount_verify_buckets enable row level security;

-- discount_tiers: org members read
create policy discount_tiers_select
  on public.discount_tiers
  for select
  to authenticated
  using (org_id = public.current_org_id());

-- Super Admin only: manage tiers
create policy discount_tiers_insert
  on public.discount_tiers
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'active'
    )
  );

create policy discount_tiers_update
  on public.discount_tiers
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'active'
    )
  )
  with check (org_id = public.current_org_id());

create policy discount_tiers_delete
  on public.discount_tiers
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'active'
    )
  );

-- Internal tables: block direct client access (Edge uses service_role)
create policy staff_qr_tokens_deny
  on public.staff_qr_tokens
  for all
  to authenticated
  using (false)
  with check (false);

create policy scan_logs_deny_mutations
  on public.scan_logs
  for all
  to authenticated
  using (false)
  with check (false);

create policy scan_logs_super_admin_select
  on public.scan_logs
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.status = 'active'
    )
  );

create policy discount_verify_buckets_deny
  on public.discount_verify_buckets
  for all
  to authenticated
  using (false)
  with check (false);
