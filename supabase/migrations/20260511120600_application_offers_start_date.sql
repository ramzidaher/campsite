alter table public.application_offers
  add column if not exists offer_start_date text;
