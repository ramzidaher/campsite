# Full app testing guide

This is the **entry point** for exercising CampSite end-to-end: automated checks, seeded environments, spreadsheets, and security scenarios. Use **local or staging** Supabase only (seeds use `example.com` emails).

---

## 1. What “full testing” means here

| Layer | What | Where |
|--------|------|--------|
| **Unit / lib tests** | Business rules, RBAC helpers, parsers | `npm test` (Turbo → Jest in `apps/web`) |
| **Seeded QA org** | Deterministic users, departments, draft broadcast, HR samples | `npm run seed-qa-full` + [QA_SEED_AND_SCENARIOS.md](./QA_SEED_AND_SCENARIOS.md) |
| **Role matrix lab** | Many roles / overlap (random email tags per run) | `npm run seed-demo-org` + [demo-org-logins.md](./demo-org-logins.md) |
| **Route & permission inventory** | Checkbox lists for every page + API + mobile screen | [FULL_APP_TEST_CHECKLIST.csv](./FULL_APP_TEST_CHECKLIST.csv), [FULL_APP_TEST_CHECKLIST_GRANULAR.csv](./FULL_APP_TEST_CHECKLIST_GRANULAR.csv) |
| **Founder-only** | Platform HQ, legal policies, global RBAC | `npm run add-platform-founder` (see script header) |
| **Mobile** | Expo app against same Supabase | `cd apps/mobile && npm run dev` |

There is **no Playwright/Cypress suite** in this repo yet; “full” manual QA relies on **seed + scenario doc + CSVs**. Add E2E later if you want unattended browser coverage.

---

## 2. One-time setup (local)

1. **Node** ≥ 20 (`package.json` engines).
2. **Environment** at repo root: `.env` with `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, and app URLs (`NEXT_PUBLIC_SITE_URL` for web). Mobile needs the same Supabase URL/anon key in its env (see mobile app config).
3. **Database:** `npm run supabase:db:push` (migrations applied).
4. **Web dev:** from root `npm run dev` (Turbo) or `cd apps/web && npm run dev` → typically `http://localhost:3000`.

---

## 3. Recommended seed for deep testing

**Primary (deterministic, documented scenarios):**

```bash
npm run seed-qa-full
```

- Default org slug: `campsite-qa-lab` (override: `CAMPSITE_QA_ORG_SLUG`).
- Default password: `CampSiteQA2026!` (override: `CAMPSITE_QA_PASSWORD`).
- Emails: `campsite-qa-{persona}@example.com`  see [QA_SEED_AND_SCENARIOS.md](./QA_SEED_AND_SCENARIOS.md) for personas (org admin, Jane manager, pending user, isolation cases, etc.).
- Output: `scripts/qa-seed-output.json` (gitignored) with org id and user ids.

**Password-manager import (optional):**

```bash
npm run qa:login-csv
```

Writes `scripts/qa-login-import.csv` for 1Password/Bitwarden-style import.

**Secondary (18 users, overlap lab):**

```bash
npm run seed-demo-org
```

Updates [demo-org-logins.md](./demo-org-logins.md) from script output (or use `--plan` to preview without DB writes).

---

## 4. How to run through “everything”

### A. Smoke (15–30 min)

1. Log in as **org admin** from QA doc (`campsite-qa-orgadmin@example.com`).
2. Open **Dashboard**, **Broadcasts**, **Admin → Overview**, one **HR** link  no errors.
3. Log in as **manager** (Jane)  confirm **Manager** section + scoped content.
4. Run **`npm test`** at root  all packages that define tests should pass.

### B. Scenario-driven (half day)

Follow **every table** in [QA_SEED_AND_SCENARIOS.md](./QA_SEED_AND_SCENARIOS.md) (auth, admin, manager, HR, recruitment, staff, RBAC, regression security).

### C. Inventory-driven (multi-day)

1. Open [FULL_APP_TEST_CHECKLIST.csv](./FULL_APP_TEST_CHECKLIST.csv) in Excel/Sheets.
2. Filter by `layer`: `Permission` → verify RPC/UI for each key; `Route` → hit every path; `API` → smoke authenticated/admin calls; `Mobile` → each Expo route.
3. Use [FULL_APP_TEST_CHECKLIST_GRANULAR.csv](./FULL_APP_TEST_CHECKLIST_GRANULAR.csv) for **flows** (compose broadcast, rota approval, careers apply, dept merge, etc.).
4. Cross-check [PERMISSIONS.md](../PERMISSIONS.md) when a denial should occur.

### D. Founder / platform

1. `npm run add-platform-founder` with a dedicated email (see script).
2. Sign in and walk **Founder HQ** (`/founders`): orgs, RBAC catalog, legal policies, audit  see granular rows **G-052** and CrossCutting rows in the main CSV.

### E. Public / candidate

Without staff login: `/jobs`, apply flow, status/offer token pages  use real tokens from seeded applications when available.

---

## 5. Regenerate checklists after code changes

When routes or `packages/types/src/permissions.ts` change:

```bash
npm run generate:test-checklist
```

This refreshes both CSVs from `scripts/generate-full-app-test-checklist.mjs`.

---

## 6. Mobile

```bash
cd apps/mobile && npm run dev
```

Use QA lab credentials; confirm tabs (home, broadcasts, calendar, rota, discount, HR hub) and stack screens (compose, resources, approvals). HR hub internal tabs match granular rows **G-039–G-043**.

---

## 7. HR-specific depth

[HR_TEST_CASES_AND_RUN_LOG.md](./HR_TEST_CASES_AND_RUN_LOG.md) and [HR_FIX_PLAN.md](./HR_FIX_PLAN.md) track HR bugs and cases  align with QA seed personas where possible.

---

## 8. Troubleshooting

See the **Troubleshooting** table in [QA_SEED_AND_SCENARIOS.md](./QA_SEED_AND_SCENARIOS.md) (empty permissions, duplicate slug, login failures, merge failures).

---

## Quick command reference

| Command | Purpose |
|---------|---------|
| `npm run supabase:db:push` | Apply migrations |
| `npm run seed-qa-full` | Deterministic QA org |
| `npm run seed-demo-org` | 18-role demo org |
| `npm run qa:login-csv` | QA login CSV for password manager |
| `npm run generate:test-checklist` | Regenerate FULL_APP_TEST_CHECKLIST*.csv |
| `npm run add-platform-founder` | Platform founder user |
| `npm test` | Unit tests |
| `npm run test:a11y --workspace @campsite/web` | Accessibility automation (`jest-axe`) |
| `npm run dev` | Web + packages via Turbo |

---

## 9. Accessibility validation (AA + selected AAA)

Run this in addition to normal smoke checks:

1. **Automation gate**
   - `npm run test:a11y --workspace @campsite/web`
   - `npm run test --workspace @campsite/web -- --runInBand`
2. **Keyboard-only checks** (no mouse):
   - Verify `Skip to main content` on first Tab from any route.
   - Confirm visible focus rings on shell nav, top bar actions, and form controls.
   - Validate modal dialogs close with `Escape` and return focus predictably.
3. **Screen reader pass**
   - **NVDA + Chrome (Windows)**: complete dashboard, broadcasts, rota, settings, admin departments.
   - **VoiceOver + Safari (macOS/iOS)**: same flows; confirm status and error announcements.
4. **Record evidence**
   - Log pass/fail in `FULL_APP_TEST_CHECKLIST_GRANULAR.csv` rows `G-061` to `G-066`.
   - Attach notes for any criterion regression and route/component owner.

---

**Bottom line:** Run **`seed-qa-full`**, follow **[QA_SEED_AND_SCENARIOS.md](./QA_SEED_AND_SCENARIOS.md)** for behaviour, and use the **CSV checklists** so no route or permission is skipped. That is full manual coverage for this codebase today.
