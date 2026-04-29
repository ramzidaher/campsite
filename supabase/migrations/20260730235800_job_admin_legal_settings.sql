-- Job-level admin/legal overrides for applicant communications and templates.
alter table if exists public.job_listings
  add column if not exists success_email_body text,
  add column if not exists rejection_email_body text,
  add column if not exists interview_invite_email_body text,
  add column if not exists offer_template_id uuid,
  add column if not exists contract_template_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_listings_offer_template_id_fkey'
  ) then
    alter table public.job_listings
      add constraint job_listings_offer_template_id_fkey
      foreign key (offer_template_id) references public.offer_letter_templates(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_listings_contract_template_id_fkey'
  ) then
    alter table public.job_listings
      add constraint job_listings_contract_template_id_fkey
      foreign key (contract_template_id) references public.offer_letter_templates(id)
      on delete set null;
  end if;
end $$;
