-- Single-row platform legal policies (Markdown). Public read; founders update via RPC only.

create table if not exists public.platform_legal_settings (
  id smallint primary key default 1 check (id = 1),
  bundle_version text not null,
  effective_label text not null,
  terms_markdown text not null default '',
  privacy_markdown text not null default '',
  data_processing_markdown text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.platform_legal_settings enable row level security;

create policy platform_legal_settings_select_public
  on public.platform_legal_settings
  for select
  to anon, authenticated
  using (true);

comment on table public.platform_legal_settings is 'Published legal copy for Campsite (single row id=1).';

create or replace function public.platform_founder_upsert_legal_settings(
  p_bundle_version text,
  p_effective_label text,
  p_terms_markdown text,
  p_privacy_markdown text,
  p_data_processing_markdown text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_platform_founder(auth.uid()) then
    raise exception 'not allowed';
  end if;

  if coalesce(length(trim(p_bundle_version)), 0) < 1 or length(p_bundle_version) > 256 then
    raise exception 'invalid bundle_version';
  end if;
  if length(p_effective_label) > 512 then
    raise exception 'effective_label too long';
  end if;
  if length(p_terms_markdown) > 500000 or length(p_privacy_markdown) > 500000 or length(p_data_processing_markdown) > 500000 then
    raise exception 'markdown too long';
  end if;

  insert into public.platform_legal_settings (
    id,
    bundle_version,
    effective_label,
    terms_markdown,
    privacy_markdown,
    data_processing_markdown,
    updated_at,
    updated_by
  )
  values (
    1,
    p_bundle_version,
    p_effective_label,
    p_terms_markdown,
    p_privacy_markdown,
    p_data_processing_markdown,
    now(),
    auth.uid()
  )
  on conflict (id) do update set
    bundle_version = excluded.bundle_version,
    effective_label = excluded.effective_label,
    terms_markdown = excluded.terms_markdown,
    privacy_markdown = excluded.privacy_markdown,
    data_processing_markdown = excluded.data_processing_markdown,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
end;
$$;

grant execute on function public.platform_founder_upsert_legal_settings(
  text, text, text, text, text
) to authenticated;

revoke all on table public.platform_legal_settings from public;
grant select on table public.platform_legal_settings to anon, authenticated;

-- Seed defaults (matches prior static pages; founders can edit in HQ).
insert into public.platform_legal_settings (
  id,
  bundle_version,
  effective_label,
  terms_markdown,
  privacy_markdown,
  data_processing_markdown
)
values (
  1,
  '2026-04-12',
  '12 April 2026',
  $terms$
These terms govern use of Campsite. Replace the sections below with counsel-approved text from your organisation before relying on them in production.

## 1. Who we are

Campsite is operated by **Common Ground Studios Ltd** (UK). Contact: [privacy@camp-site.co.uk](mailto:privacy@camp-site.co.uk).

## 2. The service

Campsite provides internal communications, scheduling, and related tools for teams and organisations. Features may change as we improve the product.

## 3. Accounts and acceptable use

You must provide accurate information, keep credentials secure, and use the service only for lawful purposes and in line with your organisation’s rules. We may suspend access where necessary to protect the service or other users.

## 4. Changes

We may update these terms. Material changes will be reflected by a new bundle version and effective date on this page. Continued use after changes may constitute acceptance where permitted by law.
$terms$,
  $privacy$
This policy describes how we handle personal data in Campsite. Replace the detail below with counsel-approved, jurisdiction-specific text before production launch.

## Data controller

**Common Ground Studios Ltd** (UK) is the controller for personal data processed to operate the Campsite service and your account.

## What we process

We process account data (for example name and email), workspace and organisational data, content you submit (such as broadcasts and rota information), and usage data needed to run and secure the service. HR or recruitment data may be processed when your organisation uses those features.

## Purposes and lawful bases

We use data to provide the service, authenticate users, improve reliability and security, and meet legal obligations. Your organisation’s use of Campsite may rely on separate lawful bases for employee data  document those in your workplace privacy notices.

## Your rights

Depending on applicable law, you may have rights to access, rectify, delete, restrict, or object to processing, and to complain to a supervisory authority. Contact us to exercise your rights.

## Contact

[privacy@camp-site.co.uk](mailto:privacy@camp-site.co.uk)
$privacy$,
  $dp$
This page summarises how Campsite processes personal data in its role as a service provider. Pair it with our [Privacy policy](/privacy). Replace with jurisdiction-specific and contract-specific wording as required.

## 1. Roles

Your employer or organisation is typically the **data controller** for staff and HR data they enter or instruct you to enter. Common Ground Studios Ltd acts as a **processor** when we host and process that data only to provide Campsite.

## 2. Purposes

We process data to provide accounts, internal communications, rotas, recruitment flows, and related features you enable for your workspace.

## 3. Subprocessors and transfers

We use infrastructure and service providers to run Campsite (for example hosting and authentication). List them in your Data Processing Agreement where required. Document international transfer mechanisms if data leaves the UK/EEA.

## 4. Retention

Retention depends on your organisation’s settings, backups, and legal obligations. Define retention rules in your internal policies and DPA as needed.
$dp$
)
on conflict (id) do nothing;
