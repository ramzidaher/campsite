-- Phase 5: Offer letter templates, application offers, e-signature storage, merge-friendly HTML.

insert into storage.buckets (id, name, public)
values ('application-signed-offers', 'application-signed-offers', false)
on conflict (id) do nothing;

create policy application_signed_offers_select_org_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'application-signed-offers'
    and split_part(name, '/', 1) = (
      select (p.org_id)::text
      from public.profiles p
      where p.id = auth.uid()
    )
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- Templates (rich HTML with {{merge}} fields)
-- ---------------------------------------------------------------------------

create table public.offer_letter_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  body_html text not null default '',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index offer_letter_templates_org_idx on public.offer_letter_templates (org_id, name);

-- ---------------------------------------------------------------------------
-- Per-application offer + signing
-- ---------------------------------------------------------------------------

create table public.application_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_application_id uuid not null references public.job_applications (id) on delete cascade,
  template_id uuid references public.offer_letter_templates (id) on delete set null,
  body_html text not null,
  portal_token text not null unique,
  status text not null default 'sent' check (status in ('sent', 'signed', 'declined', 'superseded')),
  signer_typed_name text,
  signature_storage_path text,
  signed_pdf_storage_path text,
  signed_at timestamptz,
  declined_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index application_offers_app_idx on public.application_offers (job_application_id, created_at desc);
create index application_offers_org_idx on public.application_offers (org_id, created_at desc);

alter table public.job_applications
  add column if not exists offer_letter_status text
    check (offer_letter_status is null or offer_letter_status in ('sent', 'signed', 'declined'));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.offer_letter_templates enable row level security;
alter table public.application_offers enable row level security;

create policy offer_letter_templates_org_admin_all
  on public.offer_letter_templates
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  )
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

create policy application_offers_org_admin_all
  on public.application_offers
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  )
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- ---------------------------------------------------------------------------
-- Public read for signing page (token only; no PII beyond letter body)
-- ---------------------------------------------------------------------------

create or replace function public.get_application_offer_for_signing(p_portal_token text)
returns table (
  body_html text,
  status text,
  org_name text,
  candidate_name text,
  job_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t text := nullif(trim(p_portal_token), '');
begin
  if v_t is null then
    return;
  end if;

  return query
  select
    o.body_html,
    o.status::text,
    org.name::text,
    ja.candidate_name::text,
    jl.title::text
  from public.application_offers o
  join public.job_applications ja on ja.id = o.job_application_id
  join public.organisations org on org.id = o.org_id
  join public.job_listings jl on jl.id = ja.job_listing_id
  where o.portal_token = v_t
    and org.is_active = true;
end;
$$;

grant execute on function public.get_application_offer_for_signing(text) to anon, authenticated;
