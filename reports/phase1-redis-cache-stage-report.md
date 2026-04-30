# Phase 1 Stage Report — Redis Shared Cache
**Date:** 2026-04-30
**Based on:** `reports/architecture-findings-20260429.md`
**Status:** FUNCTIONALLY COMPLETE — one gap remaining (cache invalidation on writes)

**Follow-up:** cache invalidation coverage work is tracked in `reports/phase1-cache-invalidation-stage-report.md`

---

## Audit Findings & Fixes (applied after initial implementation)

Two bugs caught during self-audit and fixed before merging:

**Bug 1 — Redis null-value ambiguity (fixed):**
`redis.get()` returns `null` for both "key not found" and "stored null value." `HrDashboardStats` is typed `Record<string, unknown> | null` and can legitimately be null from the DB. Fixed with a `CacheEnvelope<T> = { v: T }` wrapper — stored as `{"v":null}`, unambiguously different from a missing key. Shell bundle path (`redisGet`/`redisSet`) is exempt — `ShellBundle` is always a non-null object.

**Bug 2 — Shell Redis hit labelled `'miss'` (fixed):**
`withShellCacheMeta` at the `awaitWithTimeout` site always applied status `'miss'`. Redis hits now call `withShellCacheMeta(redisBundle, 'hit', ...)` directly before returning.

---

## What Was Done

### 1.1 — Shared Redis cache utility
`src/lib/cache/sharedCache.ts` — three-tier cache:
- **L1** in-process Map (0ms, per-instance, same as before)
- **L2** Upstash Redis (~1ms, shared across all Vercel instances — eliminates thundering herd)
- **L3** Supabase DB (50–500ms, only on full miss)

Gracefully degrades to L1-only if `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent. Per-instance in-flight coalescing (`inFlight` Map) is preserved. Redis write failures are non-fatal. `cacheNamespace` prevents key collisions across different caches that previously shared `org:${orgId}` keys in separate Maps.

### 1.2 — All 11 page-data cache files migrated

| File | Old TTL | New TTL | Redis namespace |
|---|---|---|---|
| `getCachedHrDashboardStats.ts` | 12s | 60s | `campsite:hr:dashboard` |
| `getCachedHrDirectoryPageData.ts` | 8s | 60s | `campsite:hr:directory` |
| `getCachedHrOverviewStats.ts` | 10s | 60s | `campsite:hr:overview` |
| `getCachedOrgChartPageData.ts` | 10s | 60s | `campsite:hr:org-chart` |
| `getCachedPerformanceCyclesPageData.ts` | 10s | 120s | `campsite:hr:performance` |
| `getCachedOnboardingHubData.ts` | 8s | 60s | `campsite:hr:onboarding` |
| `getCachedOnboardingTemplateTasks` (same file) | 8s | 60s | `campsite:hr:onboarding:tasks` |
| `getCachedInterviewSchedulePageData.ts` | 8s | 30s | `campsite:jobs:interviews` |
| `getCachedAdminJobsPageData.ts` | 10s | 60s | `campsite:jobs:listings` |
| `getCachedAdminApplicationsPageData.ts` | 8s | 30s | `campsite:jobs:applications` |
| `getCachedRecruitmentQueuePageData.ts` | 8s | 30s | `campsite:jobs:recruitment` |

`getCachedAdminJobsPageData.ts` had a bespoke inline implementation — refactored to match the consistent pattern of all other files.

All TTLs are env-var overridable via existing `CAMPSITE_*_CACHE_TTL_MS` vars.

### 1.3 — Shell bundle Redis L2
`cachedMainShellLayoutBundle.ts` checks Redis before firing `main_shell_layout_bundle` RPC on cold instances. Only non-degraded bundles are written to Redis. Shell default TTL raised 10s → 30s. Redis key: `campsite:shell:user:${userId}`.

### 1.4 — AppShell degraded banner fix (bonus — not in original plan)
Raw internal reason codes (`app_timeout_fallback`, `permission_keys_recovery_timeout`) were rendered inside the amber "Refreshing workspace data..." banner visible to clients. Removed. Internal reasons remain in the bundle data for Sentry/logging — just not shown in the UI.

---

## Phase 1 Checklist — Actual Status

| Item | Status | Notes |
|---|---|---|
| Install `@upstash/redis`, provision, add env vars | ✅ Done | Env vars in root `.env` and Vercel |
| Create shared Redis cache utility | ✅ Done | `sharedCache.ts` (named differently from report) |
| Migrate shell bundle to Redis | ✅ Done | |
| Migrate all 11 page-data cache files | ✅ Done | |
| Raise TTLs to report-recommended values | ✅ Done | |
| **Add cache invalidation on write mutations** | ❌ **Not done** | Needs audit of mutation endpoints — real gap |
| Create `PermissionsContext` at layout level | ⚪ Not needed | Pages already use React `cache()`-deduplicated shell bundle — zero extra DB cost |
| Remove 64 `has_permission` RPC calls from pages | ⚪ Already done | Zero calls in page files — all exist in API mutation handlers (correct) |
| Run prod-route-thrash repro script | ❌ Not done | Needs deploy first |
| Redis verified working locally | ✅ Confirmed | `/api/loadtest/redis-check` route added for diagnostics |

---

## What Was Pre-Verified Before Changes

- `has_permission` in pages: zero — already eliminated before this session. API route calls (privacy, roles, members) are correct write-path guards and must stay.
- `getCachedAdminJobsPageData.ts` was the only file not using the shared utility — fixed.
- Cache key collision risk: old `org:${orgId}` keys were safe per-instance but would collide in Redis — fixed with namespacing.
- Permissions flow: 31 main-app pages already call `getCachedMainShellLayoutBundle()` + `parseShellPermissionKeys()`. React `cache()` deduplicates the RPC per request. `PermissionsContext` would save nothing meaningful.

---

## Remaining Phase 1 Gap — Cache Invalidation

When a user creates a job, updates HR data, or changes recruitment status, the relevant Redis key will serve stale data until TTL expires. TTLs are 30–120s so the window is tolerable, but explicit invalidation on writes is the correct fix.

**Next task:** Identify all write mutation endpoints and add `invalidateSharedCache(namespace, key)` calls.
Key mapping:
| Write event | Cache to invalidate |
|---|---|
| Job publish/archive | `campsite:jobs:listings`, `campsite:hr:overview` |
| Application status change | `campsite:jobs:applications`, `campsite:hr:overview` |
| Recruitment request change | `campsite:jobs:recruitment` |
| Interview slot write | `campsite:jobs:interviews` |
| HR record / profile update | `campsite:hr:directory`, `campsite:hr:overview` |
| Org chart / dept change | `campsite:hr:org-chart`, `campsite:hr:directory` |
| Performance cycle create/close | `campsite:hr:performance` |
| Onboarding template change | `campsite:hr:onboarding`, `campsite:hr:onboarding:tasks` |
| Role / permission change | `campsite:shell:user:${userId}` (or flush all shell keys) |

---

## Files Changed

```
apps/web/package.json                                             @upstash/redis ^1.37.0 added
apps/web/src/lib/cache/sharedCache.ts                            NEW
apps/web/src/lib/hr/getCachedHrDashboardStats.ts                 migrated + TTL 12s→60s
apps/web/src/lib/hr/getCachedHrDirectoryPageData.ts              migrated + TTL 8s→60s
apps/web/src/lib/hr/getCachedHrOverviewStats.ts                  migrated + TTL 10s→60s
apps/web/src/lib/hr/getCachedOrgChartPageData.ts                 migrated + TTL 10s→60s
apps/web/src/lib/hr/getCachedPerformanceCyclesPageData.ts        migrated + TTL 10s→120s
apps/web/src/lib/hr/getCachedOnboardingHubData.ts                migrated (2 caches) + TTL 8s→60s
apps/web/src/lib/interviews/getCachedInterviewSchedulePageData.ts migrated + TTL 8s→30s
apps/web/src/lib/jobs/getCachedAdminJobsPageData.ts              migrated (refactored inline) + TTL 10s→60s
apps/web/src/lib/jobs/getCachedAdminApplicationsPageData.ts      migrated + TTL 8s→30s
apps/web/src/lib/recruitment/getCachedRecruitmentQueuePageData.ts migrated + TTL 8s→30s
apps/web/src/lib/supabase/cachedMainShellLayoutBundle.ts         Redis L2 + TTL 10s→30s
apps/web/src/components/AppShell.tsx                             removed internal reason from banner
apps/web/src/app/api/loadtest/redis-check/route.ts               NEW — local diagnostic endpoint
```

---

## How to Verify Redis Is Working

1. Visit any HR page while logged in — triggers DB load + Redis write
2. Check **Upstash dashboard → Data Browser** — keys like `campsite:hr:directory:org:uuid…` should appear
3. Restart dev server (clears L1 Map), reload the page — Redis serves it without hitting DB
4. Hit `/api/loadtest/redis-check` — should return `{ ok: true }` with ping/write/read timings

---

## Phases 2 & 3 — Not Started

### Phase 2 (target: within 2 weeks of deploy)
- [ ] Enable Supabase read replica on Pro plan
- [ ] Create `lib/supabase/readReplica.ts` client helper
- [ ] Route HR listing RPCs (`hr_directory_list`, `org_chart_directory_core_list`, `hr_dashboard_stats`, etc.) to read replica
- [ ] Audit Realtime subscriptions for leaks (`subscription.unsubscribe()` on unmount)
- [ ] Decide: keep Realtime for broadcasts or replace with 30s poll
- [ ] Implement materialized view or cache table for `hr_dashboard_stats`
- [ ] Implement materialized view or cache table for `hr_directory`

**Prerequisite:** Phase 1 validated in production (deploy + run prod-route-thrash script).

### Phase 3 (target: within 4 weeks of deploy)
- [ ] Replace all unbounded `new Map<string, TtlCacheEntry>()` with bounded LRU cache (`lru-cache`)
- [ ] Squash 320 migrations to single baseline after schema stabilises
- [ ] Scope or retire `packages/api` (`@campsite/api`)
- [ ] Document cache key schema and invalidation rules in `ARCHITECTURE.md`

---

## Expected Outcomes (from architecture report)

**After Phase 1 + cache invalidation:**
- Shell RPC calls under concurrent load: N simultaneous DB calls → max 1 per 30s per user
- HR page data: N simultaneous DB calls per org → max 1 per 30–120s per org
- Thundering herd on new Vercel instances: eliminated
- Prod-route-thrash scenario: 0 hard shell timeouts, <3s average page latency

**After Phase 2:**
- Primary DB load reduced ~50% (read replica absorbs HR listing queries)
- Shell bundle mean latency back to 50–200ms range
- Realtime WAL overhead reduced

**After Phase 3:**
- Instance memory stable (bounded LRU, no unbounded Map growth)
- CI reset time 60–80% faster (1 baseline vs 320 migrations)
- Clear data-fetching ownership: web = `lib/supabase/` + Redis, mobile = `@campsite/mobile-api`
