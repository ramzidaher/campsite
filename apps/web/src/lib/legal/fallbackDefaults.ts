import type { PlatformLegalSettings } from '@/lib/legal/types';

/** Used when DB row is missing (e.g. migration not applied locally). */
export const FALLBACK_LEGAL_SETTINGS: PlatformLegalSettings = {
  bundle_version: '2026-04-12',
  effective_label: '12 April 2026',
  terms_markdown: `These terms govern use of Campsite. Replace the sections below with counsel-approved text from your organisation before relying on them in production.

## 1. Who we are

Campsite is operated by **Common Ground Studios Ltd** (UK). Contact: [privacy@camp-site.co.uk](mailto:privacy@camp-site.co.uk).

## 2. The service

Campsite provides internal communications, scheduling, and related tools for teams and organisations. Features may change as we improve the product.

## 3. Accounts and acceptable use

You must provide accurate information, keep credentials secure, and use the service only for lawful purposes and in line with your organisation’s rules. We may suspend access where necessary to protect the service or other users.

## 4. Changes

We may update these terms. Material changes will be reflected by a new bundle version and effective date on this page. Continued use after changes may constitute acceptance where permitted by law.`,
  privacy_markdown: `This policy describes how we handle personal data in Campsite. Replace the detail below with counsel-approved, jurisdiction-specific text before production launch.

## Data controller

**Common Ground Studios Ltd** (UK) is the controller for personal data processed to operate the Campsite service and your account.

## What we process

We process account data (for example name and email), workspace and organisational data, content you submit (such as broadcasts and rota information), and usage data needed to run and secure the service. HR or recruitment data may be processed when your organisation uses those features.

## Purposes and lawful bases

We use data to provide the service, authenticate users, improve reliability and security, and meet legal obligations. Your organisation’s use of Campsite may rely on separate lawful bases for employee data — document those in your workplace privacy notices.

## Your rights

Depending on applicable law, you may have rights to access, rectify, delete, restrict, or object to processing, and to complain to a supervisory authority. Contact us to exercise your rights.

## Contact

[privacy@camp-site.co.uk](mailto:privacy@camp-site.co.uk)`,
  data_processing_markdown: `This page summarises how Campsite processes personal data in its role as a service provider. Pair it with our [Privacy policy](/privacy). Replace with jurisdiction-specific and contract-specific wording as required.

## 1. Roles

Your employer or organisation is typically the **data controller** for staff and HR data they enter or instruct you to enter. Common Ground Studios Ltd acts as a **processor** when we host and process that data only to provide Campsite.

## 2. Purposes

We process data to provide accounts, internal communications, rotas, recruitment flows, and related features you enable for your workspace.

## 3. Subprocessors and transfers

We use infrastructure and service providers to run Campsite (for example hosting and authentication). List them in your Data Processing Agreement where required. Document international transfer mechanisms if data leaves the UK/EEA.

## 4. Retention

Retention depends on your organisation’s settings, backups, and legal obligations. Define retention rules in your internal policies and DPA as needed.`,
  updated_at: null,
};
