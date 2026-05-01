# Page-layer Stage H - Admin-heavy batch (2026-05-01)

## Scope

Normalized these strict-hotspot routes to shell + shared page-data loader patterns:

- `/admin/departments`
- `/admin/hr/custom-fields`
- `/admin/offer-templates`
- `/admin/rota`

## Changes shipped

### New shared loaders

- `apps/web/src/lib/hr/getCachedAdminHrCustomFieldsPageData.ts`
- `apps/web/src/lib/admin/getCachedAdminOfferTemplatesPageData.ts`
- `apps/web/src/lib/admin/getCachedAdminRotaPageData.ts`

### Route rewires

- `apps/web/src/app/(main)/admin/departments/page.tsx`
  - moved from direct profile + permissions + `loadDepartmentsDirectory` to shell-bundle access + `getCachedAdminTeamsPageData`
- `apps/web/src/app/(main)/admin/hr/custom-fields/page.tsx`
  - moved from direct `hr_custom_field_definitions` query to `getCachedAdminHrCustomFieldsPageData`
- `apps/web/src/app/(main)/admin/offer-templates/page.tsx`
  - moved from direct `offer_letter_templates` query to `getCachedAdminOfferTemplatesPageData`
- `apps/web/src/app/(main)/admin/rota/page.tsx`
  - moved from direct profile + `loadAdminRotaDashboard` path to shell-bundle access + `getCachedAdminRotaPageData`

### Invalidation coverage extended

Updated `apps/web/src/lib/cache/cacheInvalidation.ts` for:

- `campsite:admin:offer-templates`
- `campsite:admin:hr:custom-fields`
- `campsite:admin:rota`

## Validation evidence

- `npm run typecheck --workspace @campsite/web`: pass
- `npm run lint --workspace @campsite/web`: pass (repo has pre-existing warnings only; no new errors)
- strict inventory refreshed:
  - `reports/route-audit/route-inventory-20260501-084707.csv`

## Strict audit delta

- Before: high `18` (`reports/route-audit/route-inventory-20260501-083658.csv`)
- After: high `14` (`reports/route-audit/route-inventory-20260501-084707.csv`)

Route outcomes:

- `/admin/departments` -> `medium`
- `/admin/hr/custom-fields` -> `medium`
- `/admin/offer-templates` -> `medium`
- `/admin/rota` -> `medium`

## Next strict hotspots

- `/admin/hr/onboarding`
- `/admin/jobs/[id]/applications`
- `/dashboard`
- `/hr`
- `/hr/hiring`
- `/hr/hiring/application-forms/[id]/edit`
- `/manager/departments`
- `/manager/teams`
- `/onboarding`
- `/pending`
- `/performance`
- `/profile`
- `/reports`
- `/settings`
