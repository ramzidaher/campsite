# Campsite

**Campsite** is a white-label internal communications and staff management platform built and owned by **Common Ground Studios Ltd** (UK private limited company). It is sold as isolated SaaS to organisations—initially **Student Unions** (e.g. University of Sussex Students' Union). Each customer gets a fully isolated deployment with a custom subdomain.

This document is the single source of truth for **what we are building**, **how it is structured**, and **in what order** we implement it (phase by phase).

---

## Table of contents

1. [Product summary](#product-summary)
2. [Platforms & monorepo](#platforms--monorepo)
3. [Tech stack](#tech-stack)
4. [Multi-tenancy & domains](#multi-tenancy--domains)
5. [Branding & design system](#branding--design-system)
6. [Roles & permissions](#roles--permissions)
7. [Core features (overview)](#core-features-overview)
8. [Data model (reference)](#data-model-reference)
9. [Navigation (UX map)](#navigation-ux-map)
10. [Implementation phases](#implementation-phases)
11. [Non-functional requirements](#non-functional-requirements)
12. [Repository layout (target)](#repository-layout-target)
13. [Out of scope / guardrails](#out-of-scope--guardrails)

---

## Product summary

| Aspect | Detail |
|--------|--------|
| **What it is** | One-way broadcasts, rota, calendar, staff discount verification, org admin—no org chat at MVP. |
| **Who uses it** | Staff and leaders within an organisation; Common Ground operates a **platform admin** for all orgs. |
| **Isolation** | Per-org data; default approach is **one Supabase project with RLS** on `organisation_id` unless a client requires full project isolation. |
| **Access** | `{org-slug}.campsite.app` (subdomain routing; no custom domains at MVP). |

---

## Platforms & monorepo

The product ships on **three surfaces** sharing one backend:

| Surface | Technology |
|---------|------------|
| Mobile | React Native via **Expo** (SDK 51+), iOS + Android |
| Web | **Next.js 14+** (App Router), TypeScript, responsive |

Use a **monorepo** (e.g. **Turborepo**) with shared packages:

| Path | Purpose |
|------|---------|
| `apps/mobile` | Expo app |
| `apps/web` | Next.js app |
| `packages/api` | Shared API (tRPC or REST—pick one for maintainability) |
| `packages/ui` | Shared UI components |
| `packages/types` | Shared TypeScript types (recommended) |
| `packages/theme` | Design tokens + `themePresets.ts` |

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Mobile | React Native (Expo SDK 51+) |
| Web | Next.js 14+ App Router + TypeScript |
| Backend | Node.js; **tRPC or REST** (simpler to maintain wins) |
| Database | **PostgreSQL** via **Supabase** |
| Auth | **Supabase Auth** (email/password + magic link) |
| Files | **Supabase Storage** |
| Push | **Expo Push** (mobile); browser push (web) |
| Scheduling | **pg_cron** or **BullMQ + Redis** for scheduled broadcasts |
| Google | Calendar API + Sheets API (OAuth2) |
| Styling | **NativeWind** (mobile) + **Tailwind CSS** (web) |
| Client state / server cache | **Zustand** and/or **TanStack Query** |
| Deploy | **Vercel** (web) + **Expo EAS** (mobile) |

**Principle:** cheap and scalable; Supabase free/pro for early growth; avoid over-engineering.

---

## Multi-tenancy & domains

### Tenant model

- Each organisation is logically isolated (`organisation_id` on all tenant data).
- **RLS** on every table scoped to `org_id` is the default.
- **Super Platform Admin** (Common Ground) uses **`admin.campsite.app`** to manage organisations—not org content.

### Onboarding (provider → customer)

1. Common Ground creates the org (slug/subdomain, branding).
2. An invite goes to the org’s **Super Admin**.
3. After that, the org is **self-managed**.

---

## Branding & design system

### White-label (per org)

- Subdomain: `{slug}.campsite.app`
- Logo upload by Super Admin
- Subdomain-based routing only at MVP

### Default themes

Users can switch **light / dark** in settings and pick an **accent preset** (primary buttons, active nav, unread badges, highlights).

**Light**

| Token | Hex |
|-------|-----|
| Background | `#faf9f6` |
| Surface | `#f5f4f1` |
| Text primary | `#121212` |
| Text secondary | `#6B6B6B` |
| Text muted | `#9B9B9B` |
| Border | `#D8D8D8` |
| Warning | `#B91C1C` |
| Success | `#15803D` |

**Dark**

| Token | Hex |
|-------|-----|
| Background | `#121212` |
| Surface | `#1a1a1a` |
| Text primary | `#faf9f6` |
| Text secondary | `#808080` |
| Text muted | `#B0B0B0` |
| Border | `#2A2A2A` |
| Warning | `#F87171` |
| Success | `#4ADE80` |

**Accent presets** (e.g. `themePresets.ts`): Midnight (default `#121212`), Ocean `#1D4ED8`, Emerald `#059669`, Sunset `#F97316`, Orchid `#7C3AED`, Rose `#E11D48`.

---

## Roles & permissions

Roles are **per organisation**; each user has **exactly one** role in that org. Order (highest → lowest):

| Role | Summary |
|------|---------|
| **Super Admin** | Full org: settings, departments, roles, broadcasts, rota, discounts, users, branding. Created at org setup. |
| **Senior Manager** | All broadcast types, all departments, rota, discounts, user approval. |
| **Manager** | Broadcast to assigned departments; rota; approve users in their department. |
| **Coordinator** | Broadcast to own department only; view rota. |
| **Assistant** | Broadcast to own department; **requires Manager+ approval** before send. |
| **Weekly Paid Staff** | Receive broadcasts; own rota; calendar; manage subscriptions. |
| **Society or Club Leader** | Broadcast to society/club members only; manage that member list. |

**Entity types:** Staff (one or more **departments**); **Society/Club** members (society/club modelled as a special department type).

---

## Core features overview

### 1. Authentication & onboarding

Self-registration: name, email, password → org (from subdomain) → department(s) → **category subscriptions** per department → status **`pending_verification`**. **Manager+** in the department verifies; approve/reject with optional note; approved users get push/email.

Users can change subscription preferences later in profile/settings.

### 2. Broadcast messaging

Broadcasts: title, rich-text body, department, category, optional `scheduled_at`, metadata (`created_by`, `created_at`, status: draft / scheduled / sent).

- Feed: paginated, newest first; filter by department/category; search; unread; expand full message.
- Scheduling: datetime on compose; “Scheduled” tab for senders; cancel before send; **queue** (BullMQ or pg_cron).
- **Smart calendar detection** in body (regex + light heuristics): “Add to Calendar” banner → Google Calendar if connected, else in-app event / `.ics`.

### 3. Departments & subscriptions

**No hardcoded department names.** Super Admin creates departments with: name, optional description, type (`department` | `society` | `club`), **per-department categories**, and **managers** (Manager+ for that dept). Users subscribe/unsubscribe to categories within departments they belong to.

### 4. Rota

- Import from **Google Sheets** (OAuth); configurable sync; column mapping.
- In-app edit; **weekly** (Mon–Sun) default + list view.
- Shift card: staff, department, start/end, role.
- Visibility: staff see **only their** shifts unless Manager+.
- Reminder push **X hours** before shift (user setting; default 2h).

### 5. In-app calendar

- Sources: detected broadcast events, rota shifts, manual events (Manager+).
- Month + week views; colour by source type.
- **Google Calendar:** one-way **push** from app to Google (not two-way at MVP).

### 6. Staff discount module

- Verified staff get a **rotating QR** (e.g. user, org, role, expiry ~24h).
- **Scan** (Manager+): shows name, department, role, active status.
- Super Admin configures **discount tiers per role** (informational only—no payments at MVP).
- Screens: My Discount Card, Scan a Card, Discount Rules (Super Admin).

### 7. Admin surfaces

- **Org Super Admin:** overview, users, departments, broadcasts, rota, discounts, org settings, notification defaults (web-first; also mobile).
- **Manager:** pending verifications, department broadcasts, department rota, assistant draft approval.
- **Platform admin:** list/create/suspend orgs, aggregate stats—**no org content**.

### 8. Notifications

- Mobile: Expo push; web: browser push; in-app bell + unread count; email for critical paths (e.g. Resend).
- Types: new broadcast (respecting subscriptions), shift reminder, pending verification, broadcast confirmations, scheduled send, new user in department.
- **Do Not Disturb:** quiet hours; queue delivery until window ends.

---

## Data model reference

Conceptual tables (all subject to RLS by `org_id`):

| Table | Role |
|-------|------|
| `organisations` | Org identity, slug, logo, etc. |
| `users` | User, org, role, status (pending/active/inactive) |
| `departments` | Dept, org, type, description |
| `dept_categories` | Categories per department |
| `user_departments` | User ↔ department M:N |
| `user_subscriptions` | User ↔ category subscription flags |
| `broadcasts` | Messages, scheduling, status |
| `rota_shifts` | Shifts |
| `calendar_events` | Unified calendar (source: broadcast/rota/manual) |
| `discount_tiers` | Per-role discount display rules |
| `staff_qr_tokens` | Rotating verification tokens |
| `google_connections` | OAuth tokens (calendar/sheets) |

---

## Navigation (UX map)

**Mobile (tabs):** Feed → Calendar → Rota → Discount → Profile/Settings  

**Web (sidebar):** Dashboard → Broadcasts → Calendar → Rota → Discount Card → Admin (Manager+, nested) → Settings  

---

## Implementation phases

Work proceeds in this order (MVP roadmap):

| Phase | Focus |
|-------|--------|
| **1** | Auth & onboarding: registration, verification, pending approval, roles |
| **2** | Department management: departments + categories (Super Admin) |
| **3** | Broadcast feed: compose, send, receive, filter, subscriptions |
| **4** | Rota: Sheets import + in-app views (My Schedule + Department) |
| **5** | Calendar: in-app calendar, broadcast event detection, Google push sync |
| **6** | Staff discount: QR generation + scanner |
| **7** | Admin dashboards: org admin + manager |
| **8** | Platform admin: Common Ground panel |
| **9** | Scheduled broadcasts: job queue |
| **10** | Push notifications: Expo + DnD |

Later phases assume earlier ones are usable end-to-end where dependencies exist (e.g. broadcasts before calendar event extraction).

---

## Non-functional requirements

| Area | Requirement |
|------|-------------|
| Accessibility | WCAG 2.1 AA; accessible names on controls |
| Offline | Cache last-loaded feed + rota (e.g. TanStack Query + AsyncStorage on mobile) |
| Security | Validate `org_id` on APIs; RLS; QR rotation; no cross-org leakage |
| i18n | English MVP; string structure ready for i18next (or similar) |
| Errors | User-friendly messages; no raw stacks in UI |
| Loading | Skeletons for async views |
| Testing | Unit: auth, broadcast routing, QR tokens; E2E: onboarding + broadcast (Detox / Playwright) |

---

## Repository layout (target)

```
campsite/
├── apps/
│   ├── mobile/          # Expo (e.g. Expo Router)
│   └── web/             # Next.js App Router
├── packages/
│   ├── api/             # tRPC or REST + Supabase client
│   ├── ui/
│   ├── types/           # optional but recommended
│   └── theme/           # themePresets.ts + tokens
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── turbo.json
```

**Identifiers:** app name **Campsite**; package id e.g. `com.commongroundstudios.campsite`; repo/workspace slug **`campsite`**.

---

## Developer setup (local)

1. **Prerequisites:** Node 20+, npm 10+, accounts for **hosted** Supabase / Vercel / Expo as needed. **Docker is not required** — this repo is normally used against Supabase Cloud; apply migrations via the Dashboard SQL editor or `npx supabase db push` after `supabase link` (see [ROLE-MAPPING.md](docs/campsite-v2-permissions/01-core-model-resolution/ROLE-MAPPING.md) §10).
2. **Install:** From the repo root run `npm install`.
3. **Environment:** Copy `.env.example` to `.env` at the repo root and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and other keys referenced in `apps/web` and `supabase/functions`. The web app also merges root `.env` in `next.config.ts`.
4. **Database:** Apply migrations from `supabase/migrations/` to your Supabase project (`supabase db push` or SQL editor). Bootstrap the first platform admin per Phase 5 notes in `DEPLOY.md` when using CGS admin.
5. **Web:** `npm run dev --workspace=@campsite/web` — use `tenant.localhost:3000` or `?org=slug` for tenancy (see middleware).
6. **Mobile:** `npm run start --workspace=@campsite/mobile` and Expo Go / simulator.
7. **Tests:** `npm run test --workspace=@campsite/web` (Jest). See `ARCHITECTURE.md` / `DEPLOY.md` for production build notes.

---

## Out of scope / guardrails

- No **real-time chat** (one-way broadcast only at MVP).
- No **payment processing**; discount module is verification + info only.
- No **two-way** Google Calendar sync at MVP (push from app only).
- **No hardcoded departments**—all config per org.
- **No custom email server**—Supabase Auth + transactional provider (e.g. Resend).
- **No mixing org data**—every query and policy respects `org_id`.

---

## Ownership

**Campsite** — © Common Ground Studios Ltd — [commongroundstudios.co.uk](https://commongroundstudios.co.uk)

---

*When starting a phase, align schema + RLS + API with this README first, then UI. Update this document only when product decisions change.*
