# Page Layer Stage B Report — Recruitment Route Normalization Slice 2
**Date:** 2026-04-30
**Status:** COMPLETE — recruitment queue normalized, interviews verified
**Follow-up to:** `reports/page-layer-stage-b-hiring-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/recruitment/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx`

And it also re-verified:

- `apps/web/src/app/(main)/admin/interviews/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/interviews/page.tsx`

---

## What Was Verified First

### 1. `hr/hiring/requests` is just the admin recruitment route

Verified:

- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx` re-exports `../../recruitment/page`

That meant the real normalization target was `admin/recruitment/page.tsx`.

### 2. Recruitment queue route was still doing a direct read

Before this slice, `admin/recruitment/page.tsx`:

- read shell bundle for access control
- then directly queried `recruitment_requests`

This was inconsistent with the existing shared cache loader already present in:

- `apps/web/src/lib/recruitment/getCachedRecruitmentQueuePageData.ts`

### 3. Interviews route was already aligned

Verified:

- `admin/interviews/page.tsx` already used `getCachedInterviewSchedulePageData(orgId)`
- `hr/hiring/interviews/page.tsx` simply re-exported the admin route

So no normalization change was needed there.

### 4. Cached recruitment loader initially did not match the route payload

Before switching the route, the shared recruitment loader was missing fields the client actually uses:

- `start_date_needed`
- `advert_release_date`
- `advert_closing_date`
- `shortlisting_dates`
- `interview_schedule`

That was corrected before leaving the route on the cached path.

---

## What Changed

### 1. `admin/recruitment` now uses the shared cached loader

File:

- `apps/web/src/app/(main)/admin/recruitment/page.tsx`

Change:

- removed direct `createClient()` read path
- switched route to `withServerPerf(..., getCachedRecruitmentQueuePageData(orgId), 700)`

Result:

- the recruitment queue now follows the same shared-cache strategy as the rest of the hiring list surfaces
- HR alias route benefits automatically

### 2. Recruitment queue cached payload now matches the client contract

File:

- `apps/web/src/lib/recruitment/getCachedRecruitmentQueuePageData.ts`

Change:

- widened `RecruitmentQueueRow`
- widened the `.select(...)` list to include all date/schedule fields used by `AdminRecruitmentListClient`

Result:

- route normalization does not silently drop data
- cached and uncached behavior now return the same shape for the list client

---

## Files Changed

- `apps/web/src/app/(main)/admin/recruitment/page.tsx`
- `apps/web/src/lib/recruitment/getCachedRecruitmentQueuePageData.ts`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

---

## What This Slice Improved

1. Recruitment list route family is now consistent with the shared Redis-backed cache strategy.
2. HR requests alias route benefits automatically.
3. Interviews route family was confirmed as already aligned, so we avoided a pointless refactor.
4. Recruitment queue cached payload is now structurally safe for the existing client.

---

## Remaining Work

Still open in Stage B:

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`
- `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`

Still open in Stage C:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Recommended Next Move

Move to the remaining high-signal detail pages in hiring/admin:

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`
- `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`

Then move into Stage C for the people and manager surfaces.
