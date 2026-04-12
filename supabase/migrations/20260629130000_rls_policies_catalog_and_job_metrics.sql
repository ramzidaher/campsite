-- Linter 0008 (RLS enabled but no policies): add explicit policies matching intended access.
--
-- job_listing_public_metrics: only security definer RPCs touch this table (track + summary).
-- permission_catalog: global reference rows; authenticated clients read for RBAC UI; writes via service_role / definer.

-- ---------------------------------------------------------------------------
-- job_listing_public_metrics — block direct anon/authenticated table access
-- ---------------------------------------------------------------------------

drop policy if exists job_listing_public_metrics_no_client_access on public.job_listing_public_metrics;
create policy job_listing_public_metrics_no_client_access
  on public.job_listing_public_metrics
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- permission_catalog — SELECT for signed-in users (writes stay service/definer-only)
-- ---------------------------------------------------------------------------

alter table public.permission_catalog enable row level security;

drop policy if exists permission_catalog_select_authenticated on public.permission_catalog;
create policy permission_catalog_select_authenticated
  on public.permission_catalog
  for select
  to authenticated
  using (true);
