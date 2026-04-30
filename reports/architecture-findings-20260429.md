# Architecture Findings & Remediation Plan
**Date:** 2026-04-29
**Scope:** Full backend and database architecture review
**Trigger:** Recurring production degradation under concurrent load (see `incident/prod-route-thrash-20260428-*`)

> Status note (2026-04-30): this file is the original findings document. Current Phase 1 implementation status now lives in `reports/phase1-redis-cache-stage-report.md`, `reports/phase1-cache-invalidation-stage-report.md`, `reports/phase1-production-hardening-stage-report.md`, `reports/phase1-code-closure-stage-report.md`, and `reports/phase1-production-validation-stage-report.md`. The checklist items below for `PermissionsContext` and “64 has_permission RPC calls in pages” are historical and were already resolved before remediation work started. Phase 1 is now complete after the production validation run in `reports/phase1-production-validation-stage-report.md`; remaining work belongs to Phase 2.

---

## Executive Summary

The system is not broken because of a bad technology choice. Supabase, Next.js, and Vercel are all appropriate for this product. The system is broken because **783 database calls are made across the app with no shared caching layer between the application tier and the database**, and the caching that does exist lives inside individual Vercel function instances — which cannot share state with each other.

Under concurrent load, this produces a thundering herd: multiple instances all miss their local caches simultaneously, all hit Postgres at once, PgBouncer saturates, the shell RPC times out, permissions are never returned, and users see degraded or broken UI across the board.

Every fix applied so far (module-level Maps, guardrail timeouts, permission recovery RPCs, structural/badge split) is correct local reasoning that fails at the distributed level.

---

## What the Evidence Shows

### From the incident reports (`prod-route-thrash-20260428-*`)

- **72 page requests → 70 slow, 17 hard timeouts, 48 degraded shell responses, 18 hard shell timeouts**
- The system entered a degraded state at `+0ms` — before any meaningful traffic had accumulated
- Routes that are already cached (e.g. `/hr/hiring/jobs` using `getCachedAdminJobsPageData`) still averaged **7470ms** and timed out twice — proving the bottleneck is shared DB saturation, not any single page's logic
- Post-login landings failed after 12–23s, meaning the collapse is total: even authenticated users navigating to `/` cannot get a shell response

Worst routes by average latency:

| Route | Avg latency | Timeouts |
|---|---|---|
| `/hr/records` | 9997ms | 4/6 |
| `/hr/performance` | 9594ms | 2/4 |
| `/hr/onboarding` | 9028ms | 3/5 |
| `/hr/hiring/applications` | 8595ms | 1/5 |
| `/hr/hiring/interviews` | 8357ms | 1/3 |
| `/hr/org-chart` | 7781ms | 1/5 |
| `/hr/hiring/jobs` | 7470ms | 2/5 (already cached) |

### From the Supabase query performance CSV

The top consumers of database time, by `total_time`:

| Query | Calls | Mean | Max | % of total DB time |
|---|---|---|---|---|
| `realtime.list_changes` (WAL) | 258,246 | 5ms | 3832ms | **17.4%** |
| `main_shell_badge_counts_bundle` | 3,569 | 391ms | 7544ms | **17.4%** |
| `main_shell_layout_bundle` | 783 | 890ms | 7710ms | **8.7%** |
| PostgREST session `set_config` | 79,576 | 3ms | 2133ms | **3.4%** |
| `get_my_permissions` | 2,702 | 147ms | 5846ms | **4.9%** |
| `broadcast_unread_count` | 3,862 | 100ms | 4717ms | **4.8%** |
| `has_permission` | 3,762 | 83ms | 5936ms | **3.9%** |
| `SELECT name FROM pg_timezone_names` | 327 | **757ms** | 7525ms | **3.1%** |

Three signals stand out immediately:

1. **`main_shell_badge_counts_bundle` mean 391ms, max 7544ms** — the shell RPC is timing out under DB contention, not because the query is inherently slow
2. **`pg_timezone_names` runs 327 times, mean 757ms, 391k rows, 0% index hit** — PostgREST or GoTrue scans a system catalog on every connection initialisation; you cannot fix this directly, but it consumes real DB time on every request
3. **`realtime.list_changes` 258k calls, 17% of total DB time** — the Realtime WAL subscription taxes the DB continuously regardless of whether any client is actively subscribing

### From the codebase

- **783 total `supabase.rpc()` / `.from()` calls** across the app
- **158 RPCs** called from page-level server components
- **55 in-memory `Map` instances** across `lib/` acting as local caches
- **10 bespoke `getCached*.ts` files**, each with its own TTL, in-flight coalescing, and eviction logic — all duplicated
- **`has_permission` RPC called 64 times across pages** despite the shell bundle already returning the full `permission_keys` array
- **All cache TTLs are 8–12 seconds** — too short to absorb a concurrency spike, long enough to serve stale data
- The caches are keyed by `user_id` (shell) or `org_id` (HR data), which is the right shape — but they live in module memory, not a shared store

---

## Root Cause Diagnosis

### Primary: No shared cache between the app tier and the database

The module-level `Map` caches work well within a single warm Vercel instance. Fluid Compute reuses instances across concurrent requests, so coalescing and TTL hits are real benefits within one instance. But Vercel scales horizontally — under load you have multiple instances, each with its own cold Map.

The failure pattern is:

1. Traffic spike → Vercel creates new instances
2. Each new instance has an empty Map
3. All instances simultaneously miss their local cache
4. All instances fire the same expensive RPC to Supabase
5. PgBouncer hits its connection limit; queries queue
6. Shell RPC times out at 8000ms before returning permissions
7. Pages degrade because they have no permissions to render navigation
8. Even the shell timeout fallback serves stale/degraded data
9. New logins fail because the landing page also needs the shell RPC

This is a textbook **thundering herd** problem caused by per-instance state in a distributed runtime.

### Secondary: OLAP queries running at request time on an OLTP database

The heaviest pages compute org-wide aggregations synchronously on page load:

- `hr_directory_list()` — full org member scan with JOINs across departments, roles, HR records
- `hr_dashboard_stats()` — org-wide aggregation of leave, performance, onboarding, and attendance data
- `org_chart_directory_core_list()` — full org member list with manager hierarchy and department assignments
- Performance page — loads all cycles, then counts all reviews in memory
- Onboarding page — multiple org-wide queries for templates, runs, members, tasks, and readiness in sequence

These are analytical queries. They belong in a pre-computed or materialized form, not in the synchronous request path.

### Tertiary: Redundant permission checking at the page level

The layout's shell bundle already fetches and caches `permission_keys` for the authenticated user. Individual page components then call `has_permission` (a DB round-trip) 64 times across the app to do checks the layout already did. Under load, each of those is a separate connection to Supabase.

### Quaternary: Uncontrolled infrastructure overhead

- `pg_timezone_names` full seq scan on every PostgREST connection — uncontrollable but eating 3% of DB time
- Realtime WAL subscription running at 258k calls regardless of active subscribers — if Realtime is only used for broadcasts, the overhead-to-value ratio is poor
- PostgREST session `set_config` at 79,576 calls — every `supabase.rpc()` call incurs this setup cost; reducing total RPC count reduces this proportionally

---

## Remediation Plan

### Phase 1 — Stop the bleeding (1–3 days, highest ROI)

#### 1.1 Add Upstash Redis as a shared cache

This is the single highest-impact change. It replaces the per-instance `Map` pattern with a cache that all Vercel instances share, eliminating the thundering herd entirely.

Install:
```bash
npm install @upstash/redis
```

Set env vars in Vercel:
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Create a single shared cache utility at `lib/cache/redisCache.ts`:

```ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getCachedOrLoad<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>
): Promise<T> {
  const cached = await redis.get<T>(key);
  if (cached !== null) return cached;

  const value = await load();
  await redis.set(key, value, { ex: ttlSeconds });
  return value;
}

export async function invalidateCache(key: string) {
  await redis.del(key);
}
```

Migrate each `getCached*.ts` file to use this instead of the local `Map`. Example for `getCachedHrDashboardStats.ts`:

```ts
// Before: module-level Map, per-instance, cold on new instances
const hrDashboardStatsResponseCache = new Map<string, TtlCacheEntry<HrDashboardStats>>();

// After: shared Redis, warm across all instances
export const getCachedHrDashboardStats = cache(async (orgId: string) => {
  return getCachedOrLoad(
    `org:${orgId}:hr_dashboard_stats`,
    30, // 30s — increased from 12s because Redis hits cost ~1ms
    async () => {
      const supabase = await createClient();
      const { data } = await supabase.rpc('hr_dashboard_stats');
      return (data as Record<string, unknown> | null) ?? null;
    }
  );
});
```

Cache key design:

| Data | Cache key | TTL | Invalidation trigger |
|---|---|---|---|
| Shell structural bundle | `user:${userId}:shell:structural` | 30s | Profile update, role change |
| HR dashboard stats | `org:${orgId}:hr_dashboard_stats` | 60s | Leave/attendance write |
| HR directory | `org:${orgId}:hr_directory` | 60s | Profile status change |
| Org chart | `org:${orgId}:org_chart` | 60s | Reports-to or dept change |
| Performance cycles | `org:${orgId}:performance_cycles` | 120s | Cycle create/close |
| Job listings | `org:${orgId}:job_listings` | 60s | Job publish/archive |
| Interview schedule | `org:${orgId}:interview_schedule` | 30s | Interview slot write |
| Recruitment queue | `org:${orgId}:recruitment_queue` | 30s | Request status change |

The in-process `Map` caches can stay as an L1 layer in front of Redis for the TTL duration — you get: L1 Map hit (0ms) → L2 Redis hit (~1ms) → DB miss (~50–500ms). Under load, 18 concurrent requests become at most 1 Redis fetch.

#### 1.2 Stop rechecking permissions in pages — use the shell bundle

The layout already has `permissionKeys: PermissionKey[]`. Pass it to a React context at the layout level:

```tsx
// PermissionsProvider wrapping AppShell children
<PermissionsContext.Provider value={permissionKeys}>
  {children}
</PermissionsContext.Provider>
```

Then in any page or server component that currently calls `supabase.rpc('has_permission', ...)`:

```ts
// Before — DB round-trip per check
const { data } = await supabase.rpc('has_permission', {
  p_permission_key: 'hr.view_records', ...
});

// After — array check, zero DB cost
const canViewRecords = permissionKeys.includes('hr.view_records');
```

This eliminates 64 DB calls per render cycle with zero functional change. On the server side, pass `permissionKeys` as a prop from the layout rather than re-fetching.

---

### Phase 2 — Fix the data model (1–2 weeks)

#### 2.1 Materialize expensive read models

The org-wide queries that are killing performance should be precomputed, not computed at request time.

**Option A — Postgres materialized views (simplest, stays in Supabase):**

```sql
CREATE MATERIALIZED VIEW public.hr_directory_snapshot AS
  SELECT * FROM public.hr_directory_list_internal();
WITH DATA;

CREATE UNIQUE INDEX ON public.hr_directory_snapshot (user_id, org_id);

-- Refresh concurrently on profile/dept writes via trigger or cron
REFRESH MATERIALIZED VIEW CONCURRENTLY public.hr_directory_snapshot;
```

**Option B — Cache tables updated by triggers:**

```sql
CREATE TABLE public.org_hr_stats_cache (
  org_id uuid PRIMARY KEY REFERENCES public.organisations(id),
  data jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
-- Trigger on profiles, leave_requests, attendance writes the cache row
-- App reads this table instead of computing on the fly
```

Option B gives sub-millisecond reads and writes only on mutations. Better for high-read, low-write HR data.

#### 2.2 Enable Supabase read replica and route heavy reads

Supabase Pro includes read replicas. Once enabled:

```ts
// lib/supabase/readReplica.ts
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createReadReplicaClient() {
  return createSupabaseClient(
    process.env.SUPABASE_READ_REPLICA_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
```

Route to read replica:
- `hr_directory_list`, `org_chart_directory_core_list`, `hr_dashboard_stats`
- `get_performance_cycles_for_org`, `list_job_listings`, `get_interview_schedule`
- Any other read-only aggregation RPC

Keep on primary:
- `auth.getUser()` (always)
- All write mutations
- Shell structural bundle (must reflect latest role changes immediately)

#### 2.3 Audit and reduce Realtime overhead

The Realtime WAL subscription is 17% of total DB time. Steps:

1. In Supabase dashboard → Realtime → Connections: check for subscriptions accumulating without being cleaned up (leak from components that unmount without calling `subscription.unsubscribe()`)
2. If Realtime is only used for the broadcast unread badge, replace it with a 30s poll — less DB overhead than continuous WAL
3. If Realtime is genuinely needed for live rota/calendar, ensure subscriptions are page-scoped and cleaned up on unmount

---

### Phase 3 — Structural cleanup (2–4 weeks)

#### 3.1 Consolidate the 55 Maps into one bounded LRU cache

All the `Map<string, TtlCacheEntry>` instances are the same pattern. Extract one:

```ts
// lib/cache/inProcessLruCache.ts
import { LRUCache } from 'lru-cache';

export function createTtlCache<V>(maxSize: number) {
  return new LRUCache<string, V>({
    max: maxSize,
    ttl: 0, // per-item TTL set on each .set() call
    allowStale: false,
  });
}
```

Replace all unbounded `new Map<string, TtlCacheEntry<T>>()` instances with `createTtlCache<T>(500)`. This prevents the slow memory leak on long-lived instances.

#### 3.2 Squash migrations

320 migrations means `supabase db reset` replays 320 files sequentially in CI and local dev. Once the schema is stable, squash to a single baseline:

```bash
supabase db dump --schema public > supabase/migrations/00000000000000_baseline.sql
# Archive old migrations
# All future migrations go on top of the baseline
```

Estimated 60–80% reduction in CI reset time.

#### 3.3 Retire or scope `packages/api`

`@campsite/api` was the original data-fetching layer but has been superseded by server-side RPCs in Next.js Server Components. It now only exports `fetchDashboardStatCounts` and a browser client wrapper. Either:

- **Scope it to mobile explicitly** — rename to `@campsite/mobile-api`, document that the web app uses `lib/supabase/` directly
- **Delete it** — if mobile also uses direct Supabase calls, the package has no unique value

The ambiguity about where data-fetching logic lives adds maintenance overhead.

---

## What NOT to Do

**Do not move off Supabase as the first response.** The root problem is a missing shared cache, not the database. Migrating to Neon + Clerk would reproduce the same incident on a different platform because the data access pattern is unchanged.

**Do not add more module-level Maps.** Every new `getCached*.ts` adds another cache that fails under multi-instance load. The 10 that exist should be migrated to Redis, not joined by more.

**Do not increase timeout values.** The guardrail timeouts (8s for shell, 4s in-flight await) are already correctly set. The underlying DB work is genuinely taking 8+ seconds under contention. More timeout budget just means slower degraded responses, not fewer of them.

---

## Migration Checklist

### Phase 1 (immediate)
- [ ] Install `@upstash/redis`, provision Upstash instance, add env vars to Vercel
- [ ] Create `lib/cache/redisCache.ts` shared cache utility
- [ ] Migrate `cachedMainShellLayoutBundle.ts` shell structural cache to Redis
- [ ] Migrate `getCachedHrDashboardStats.ts` → Redis, key `org:${orgId}:hr_dashboard_stats`, TTL 60s
- [ ] Migrate `getCachedHrDirectoryPageData.ts` → Redis, key `org:${orgId}:hr_directory`, TTL 60s
- [ ] Migrate `getCachedOrgChartPageData.ts` → Redis, key `org:${orgId}:org_chart`, TTL 60s
- [ ] Migrate `getCachedPerformanceCyclesPageData.ts` → Redis, TTL 120s
- [ ] Migrate `getCachedOnboardingHubData.ts` → Redis, TTL 60s
- [ ] Migrate `getCachedHrOverviewStats.ts` → Redis, TTL 60s
- [ ] Migrate `getCachedAdminJobsPageData.ts` → Redis, TTL 60s
- [ ] Migrate `getCachedAdminApplicationsPageData.ts` → Redis, TTL 30s
- [ ] Migrate `getCachedRecruitmentQueuePageData.ts` → Redis, TTL 30s
- [ ] Migrate `getCachedInterviewSchedulePageData.ts` → Redis, TTL 30s
- [ ] Add cache invalidation calls on relevant write mutations
- [ ] Create `PermissionsContext` at layout level
- [ ] Remove 64 `has_permission` RPC calls from pages, replace with context/prop checks
- [ ] Run prod-route-thrash repro script to validate improvement

### Phase 2 (within 2 weeks)
- [ ] Enable Supabase read replica on Pro plan
- [ ] Create `lib/supabase/readReplica.ts` client helper
- [ ] Route HR listing RPCs to read replica
- [ ] Audit Realtime subscriptions for leaks (`subscription.unsubscribe()` on unmount)
- [ ] Decide: keep Realtime for broadcasts or replace with polling
- [ ] Implement materialized view or cache table for `hr_dashboard_stats`
- [ ] Implement materialized view or cache table for `hr_directory`

### Phase 3 (within 4 weeks)
- [ ] Replace all `new Map<string, TtlCacheEntry>()` with bounded LRU cache
- [ ] Squash migrations to single baseline after schema stabilises
- [ ] Scope or retire `packages/api`
- [ ] Document cache key schema and invalidation rules in `ARCHITECTURE.md`

---

## Expected Outcome

**After Phase 1:**
- Shell RPC calls under concurrent load: N simultaneous DB calls → max 1 per 30s per user (all others Redis hits at ~1ms)
- HR page data: N simultaneous DB calls per org → max 1 per 60s per org
- `has_permission` RPC calls: 64 → 0
- The prod-route-thrash scenario (6 users × 3 tabs) should produce 0 hard shell timeouts and <3s average page latency

**After Phase 2:**
- Primary DB load reduced by ~50% (read replica absorbs HR listing queries)
- Shell bundle mean latency returns to the 50–200ms range seen on healthy single-user requests
- Realtime WAL overhead reduced if subscription leaks are fixed

**After Phase 3:**
- Instance memory stable — bounded LRU, no unbounded Map growth on long-lived instances
- CI reset time: 320 migrations → 1 baseline + delta, estimated 60–80% faster
- Clear ownership of data-fetching: web uses `lib/supabase/` + Redis cache; mobile uses `@campsite/mobile-api`
