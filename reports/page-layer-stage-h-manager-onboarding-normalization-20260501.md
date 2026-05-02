# Page-layer Stage H - Manager + onboarding normalization (2026-05-01)

## Scope

Normalized these strict-high routes to shell + shared loader patterns:

- `/manager/departments`
- `/manager/teams`
- `/onboarding`

`/pending` was intentionally left for a dedicated follow-up slice because it includes registration bootstrap and notification side effects.

## Changes shipped

### New shared loaders

- `apps/web/src/lib/manager/getCachedManagerWorkspaceDirectoryPageData.ts`
- `apps/web/src/lib/hr/getCachedEmployeeOnboardingPageData.ts`

### Route rewires

- `apps/web/src/app/(main)/manager/departments/page.tsx`
  - moved from direct profile/permission/department reads to shell + `getCachedManagerWorkspaceDirectoryPageData`
- `apps/web/src/app/(main)/manager/teams/page.tsx`
  - moved from direct profile/permission/department reads to shell + `getCachedManagerWorkspaceDirectoryPageData`
- `apps/web/src/app/(main)/onboarding/page.tsx`
  - moved from direct profile/permissions/run/tasks reads to shell + `getCachedEmployeeOnboardingPageData`

### Invalidation coverage extended

Updated `apps/web/src/lib/cache/cacheInvalidation.ts` for:

- `campsite:manager:workspace-directory`
- `campsite:onboarding:employee`

## Validation evidence

- `npm run typecheck --workspace @campsite/web`: pass
- `npm run lint --workspace @campsite/web`: pass (warnings only, no new errors)
- strict inventory refreshed:
  - `reports/route-audit/route-inventory-20260501-095146.csv`

## Strict audit delta

- Before: high `10` (`reports/route-audit/route-inventory-20260501-094614.csv`)
- After: high `7` (`reports/route-audit/route-inventory-20260501-095146.csv`)

Route outcomes:

- `/manager/departments` -> `medium`
- `/manager/teams` -> `medium`
- `/onboarding` -> `medium`
