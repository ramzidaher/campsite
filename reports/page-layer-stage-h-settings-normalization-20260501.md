# Page-layer Stage H - Settings normalization (2026-05-01)

## Scope

Normalized `/settings` from page-level direct reads to shared loader.

## Changes shipped

- new shared loader:
  - `apps/web/src/lib/settings/getCachedSettingsPageData.ts`
- route rewire:
  - `apps/web/src/app/(main)/settings/page.tsx`
- cache invalidation coverage extended:
  - `apps/web/src/lib/cache/cacheInvalidation.ts` now includes `campsite:settings:page`

## Validation evidence

- `npm run typecheck --workspace @campsite/web`: pass
- `npm run lint --workspace @campsite/web`: pass (warnings only, no new errors)
- strict inventory refreshed:
  - `reports/route-audit/route-inventory-20260501-091247.csv`

## Strict audit delta

- Before: high `13` (`reports/route-audit/route-inventory-20260501-090813.csv`)
- After: high `12` (`reports/route-audit/route-inventory-20260501-091247.csv`)

Route outcome:

- `/settings` -> `medium`
