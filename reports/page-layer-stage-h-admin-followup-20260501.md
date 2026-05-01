# Page-layer Stage H - Admin follow-up (2026-05-01)

## Scope

Targeted highest remaining admin hotspots:

- `/admin/hr/onboarding`
- `/admin/jobs/[id]/applications`

## Changes shipped

### New shared loaders / route-data

- `apps/web/src/lib/jobs/getCachedJobApplicationsAccessData.ts`
- `apps/web/src/lib/hr/onboardingHubRouteData.ts`
- extended `apps/web/src/lib/hr/getCachedOnboardingHubData.ts` with `getCachedOnboardingHubRuns`

### Route rewires

- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`
  - moved panelist access check from direct page query to shared loader path (`getCachedJobApplicationsAccessData`)
- `apps/web/src/app/(main)/admin/hr/onboarding/page.tsx`
  - moved run listing query off page into shared onboarding route-data orchestration + cached runs loader

### Invalidation coverage extended

Updated `apps/web/src/lib/cache/cacheInvalidation.ts` for:

- `campsite:jobs:detail:applications:access`
- `campsite:hr:onboarding:runs`

## Validation evidence

- `npm run typecheck --workspace @campsite/web`: pass
- `npm run lint --workspace @campsite/web`: pass (warnings only, no new errors)
- strict inventory refreshed:
  - `reports/route-audit/route-inventory-20260501-090813.csv`

## Strict audit delta

- Before: high `14` (`reports/route-audit/route-inventory-20260501-084707.csv`)
- After: high `13` (`reports/route-audit/route-inventory-20260501-090813.csv`)

Route outcomes:

- `/admin/jobs/[id]/applications` -> `medium`
- `/admin/hr/onboarding` -> still `high` in strict helper-aware classification (now with `directReadCount=0`; remaining high signal is local-map/fallback taxonomy)
