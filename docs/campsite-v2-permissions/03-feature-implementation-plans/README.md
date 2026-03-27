# Feature implementation plans (backend + **web** frontend)

**Purpose:** Per-feature runbooks for CampSite v2 **web app only** (`apps/web`). Each file is the single place to look when implementing, auditing, or extending that area. Follow the order **shared types → database (RLS/RPC) → server routes → shell/nav → client UI** unless a file says otherwise.

**Authority:** Canonical role model and legacy mapping live in [../01-core-model-resolution/ROLE-MAPPING.md](../01-core-model-resolution/ROLE-MAPPING.md). Broadcast dept toggles contract: [../02-broadcast-baseline-toggles/PLAN.md](../02-broadcast-baseline-toggles/PLAN.md).

**Repo map (monorepo):**

| Area | Path |
|------|------|
| Web (Next.js App Router) | `apps/web/` |
| Shared types & role helpers | `packages/types/` |
| Shared Supabase-backed API helpers | `packages/api/` |
| Supabase SQL migrations | `supabase/migrations/` |
| Edge Functions | `supabase/functions/` |

## Plan index

| # | Document | Feature |
|---|----------|---------|
| 01 | [01-auth-and-registration.md](./01-auth-and-registration.md) | Login, register, forgot password, session, pending state, profile bootstrap |
| 02 | [02-member-approvals-and-profiles.md](./02-member-approvals-and-profiles.md) | Pending queue, approve/reject, role assignment, `profiles` / `user_departments` |
| 03 | [03-dashboard.md](./03-dashboard.md) | Home KPIs, previews, deep links |
| 04 | [04-broadcasts.md](./04-broadcasts.md) | Feed, compose, approvals, dept toggles, notifications |
| 05 | [05-calendar.md](./05-calendar.md) | Calendar views, events, Google, rota overlay |
| 06 | [06-rota.md](./06-rota.md) | Staff rota grid, admin rota, Google Sheets import |
| 07 | [07-discount-staff-card.md](./07-discount-staff-card.md) | Card UI, QR verify, tiers, scan logs, Edge Functions |
| 08 | [08-org-admin.md](./08-org-admin.md) | `/admin` shell, users, departments, categories, settings, integrations |
| 09 | [09-manager-workspace.md](./09-manager-workspace.md) | `/manager` layout and manager-specific UX |
| 10 | [10-user-settings.md](./10-user-settings.md) | Profile settings, appearance, password, org-admin-only subpages |
| 11 | [11-platform-founders.md](./11-platform-founders.md) | `platform_admins`, `/founders`, cross-org tooling |
| 12 | [12-push-and-notification-jobs.md](./12-push-and-notification-jobs.md) | Push tokens, broadcast notification jobs, Edge processor |

## Standard checklist (copy into PRs)

```markdown
- [ ] `packages/types`: new or updated `canX` / scope helpers; exported from `packages/types/src/index.ts`
- [ ] SQL: RLS policies + `SECURITY DEFINER` functions; new migration file with forward-only changes
- [ ] Web: `page.tsx` or `layout.tsx` server redirect matches types
- [ ] Web: `AppShell` / `adminGates` nav uses same helpers (no raw `role ===` except legacy bridge)
- [ ] Docs: this plan file updated if behaviour changed
```

## Conventions used in these plans

- **`apps/mobile` is out of scope** for these documents; they describe **`apps/web`** UI only. Shared packages (`packages/types`, `packages/api`) are referenced where the web app imports them.
- **Org admin** means `profiles.role` in `org_admin` (legacy `super_admin` may still appear in DB until fully migrated).
- **Platform admin** means `platform_admins` table — never infer from `profiles.role`.
- **Server gate:** Next.js Server Component or `layout.tsx` that `redirect()`s before rendering children.
- **Client gate:** UI only; must not be sole enforcement for sensitive data.
