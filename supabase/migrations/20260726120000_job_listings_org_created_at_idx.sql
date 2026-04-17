-- Admin / hiring job list orders by org_id + created_at desc; supports hot list fetch.

create index if not exists job_listings_org_created_at_desc_idx
  on public.job_listings (org_id, created_at desc);
