# Page-layer Stage H - Shell + performance convergence (2026-05-01)

## Scope

This slice focused on:

- removing remaining page-level direct read fallback on `/dashboard`
- normalizing `/performance` to shell + shared page-data loader
- reducing false strict-high signals tied to shell cache-map detection

## Changes shipped

### Shell cache classification convergence

- updated `apps/web/src/lib/supabase/cachedMainShellLayoutBundle.ts`
  - registered shell in-memory + in-flight stores via shared cache registry:
    - `campsite:shell:bundle`

This preserves runtime behavior and aligns strict inventory classification with existing shared cache semantics.

### Dashboard page-level fallback normalization

- updated `apps/web/src/app/(main)/dashboard/page.tsx`
  - removed page-level profile lookup + `get_my_permissions` fallback path
  - now uses shell bundle as the single access contract for org/user/status/permissions before invoking `loadDashboardHomeGuarded`

### Performance index normalization

- added shared loader:
  - `apps/web/src/lib/performance/getCachedPerformanceIndexPageData.ts`
- rewired route:
  - `apps/web/src/app/(main)/performance/page.tsx`
  - removed direct profile/permissions/reviews/cycles/reviewee lookups from page
  - now uses shell bundle access + cached performance index page data
- invalidation updated in:
  - `apps/web/src/lib/cache/cacheInvalidation.ts`
  - new namespace:
    - `campsite:performance:index`

## Validation evidence

- `npm run typecheck --workspace @campsite/web`: pass
- `npm run lint --workspace @campsite/web`: pass (warnings only, no new errors)
- strict inventory refreshed:
  - `reports/route-audit/route-inventory-20260501-094614.csv`

## Strict audit delta

- Before: high `11` (`reports/route-audit/route-inventory-20260501-094202.csv`)
- After: high `10` (`reports/route-audit/route-inventory-20260501-094614.csv`)

Route outcomes:

- `/performance` -> `medium`
- `/dashboard` remains `high` (fallback/fan-out signal)
- `/hr` and `/hr/hiring` remain `high` (fallback signal), with local-map risk now cleared
