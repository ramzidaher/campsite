import 'server-only';

import { fetchDashboardStatCounts } from '@campsite/api';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canFinalApproveRotaRequests,
  canViewDashboardUnreadBroadcastKpi,
  isApproverRole,
} from '@campsite/types';

import { calendarYmdInTimeZone } from '@/lib/datetime';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { enrichBroadcastRows } from '@/lib/broadcasts/enrichBroadcastRows';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import {
  getOrLoadSharedCachedValue,
  invalidateSharedCache,
  registerSharedCacheStore,
} from '@/lib/cache/sharedCache';
import type { FeedRow, RawBroadcast } from '@/lib/broadcasts/feedTypes';
import { withServerPerf } from '@/lib/perf/serverPerf';

export type PendingPreviewRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  deptLine: string;
};

export type UpcomingEventRow = {
  id: string;
  title: string;
  start_time: string;
  color: string;
  kind: 'event' | 'shift';
};

export type DashboardHomeModel = {
  orgName: string;
  userName: string;
  profileRole: string;
  /** Sent broadcasts count; omitted when the viewer must not see KPI tiles. */
  broadcastTotal?: number;
  /** Active members count (org- or dept-scoped); omitted when the viewer must not see KPI tiles. */
  memberActiveTotal?: number;
  /** How KPI counts were computed - drives dashboard copy. */
  dashboardStatScope?: 'org' | 'dept';
  pendingCount: number | null;
  unreadCount: number;
  shiftsThisWeek: number;
  nextShiftSummary: string | null;
  recentBroadcasts: FeedRow[];
  upcomingEvents: UpcomingEventRow[];
  calendarEventDays: number[];
  calendarYear: number;
  calendarMonth: number;
  /** "Today" in org timezone (mini-calendar highlight; aligns grid month with org-local date). */
  calendarTodayY: number;
  calendarTodayM: number;
  calendarTodayD: number;
  /** When false, stat row uses a neutral broadcasts link instead of unread count (society_leader). */
  showBroadcastUnreadCount?: boolean;
  dashboardDataFreshness?: 'fresh' | 'stale' | 'unknown';
  dashboardLastSuccessAt?: number | null;
  dashboardPartialData?: boolean;
  dashboardPartialSections?: string[];
};

const DASHBOARD_HOME_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_DASHBOARD_HOME_RESPONSE_CACHE_TTL_MS ?? '8000',
  10
);
const dashboardHomeResponseCache = new Map<string, TtlCacheEntry<DashboardHomeModel>>();
const dashboardHomeInFlight = new Map<string, Promise<DashboardHomeModel>>();
registerSharedCacheStore('campsite:dashboard:home', dashboardHomeResponseCache, dashboardHomeInFlight);

function dashboardCacheKey(userId: string, orgId: string, role: string): string {
  return `${orgId}:${userId}:${role}`;
}

/** Monday-start week in local timezone */
function startOfLocalWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalWeek(d: Date): Date {
  const s = startOfLocalWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 7);
  return e;
}

export async function loadPendingApprovalsPreview(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  role: string
): Promise<PendingPreviewRow[]> {
  const full = await loadPendingApprovalRows(supabase, userId, orgId, role);
  return full.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    deptLine: p.departments.length ? p.departments.join(', ') : '-',
  }));
}

export async function getPendingApprovalCount(
  supabase: SupabaseClient,
  _userId: string,
  _orgId: string,
  role: string
): Promise<number> {
  if (!isApproverRole(role)) return 0;
  const { data, error } = await supabase.rpc('pending_approvals_nav_count');
  if (error || data === null || data === undefined) return 0;
  return typeof data === 'number' ? data : Number(data);
}

export async function loadDashboardHome(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  profile: { full_name: string | null; role: string },
  options?: {
    initialBroadcastUnread?: number;
    initialPendingApprovals?: number;
    abortSignal?: AbortSignal;
  }
): Promise<DashboardHomeModel> {
  const abortSignal = options?.abortSignal;
  const { data: orgRow } = await supabase
    .from('organisations')
    .select('name, timezone')
    .eq('id', orgId)
    .abortSignal(abortSignal ?? new AbortController().signal)
    .single();
  const orgName = (orgRow?.name as string) ?? 'Organisation';
  const orgTz = ((orgRow as { timezone?: string | null })?.timezone ?? null)?.trim() || null;

  const now = new Date();
  const calToday = calendarYmdInTimeZone(now, orgTz);
  const w0 = startOfLocalWeek(now);
  const w1 = endOfLocalWeek(now);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const canUnreadKpi = canViewDashboardUnreadBroadcastKpi(profile.role);
  const useCachedUnread = canUnreadKpi && options?.initialBroadcastUnread !== undefined;
  const unreadRpcPromise: Promise<{ data: number; error: unknown }> = useCachedUnread
    ? Promise.resolve({ data: options!.initialBroadcastUnread!, error: null })
    : canUnreadKpi
      ? Promise.resolve(
          supabase.rpc('broadcast_unread_count').abortSignal(abortSignal ?? new AbortController().signal)
        ).then((res) => ({
          data:
            res.data === null || res.data === undefined
              ? 0
              : typeof res.data === 'number'
                ? res.data
                : Number(res.data),
          error: res.error,
        }))
      : Promise.resolve({ data: 0, error: null });
  const useCachedPendingApprovals = options?.initialPendingApprovals !== undefined;

  const dashboardQueryStartedAt = Date.now();
  const [statCounts, shiftsWeekRes, nextShiftRes, recentRawRes, eventsRawRes, shiftCalendarRawRes, unreadRpc] =
    await Promise.all([
      withServerPerf(
        '/dashboard',
        'fetch_dashboard_stat_counts',
        fetchDashboardStatCounts(supabase, { userId, orgId, role: profile.role }),
        1500
      ),
      withServerPerf(
        '/dashboard',
        'rota_shifts_week_count',
        supabase
          .from('rota_shifts')
          .select('id', { count: 'planned', head: true })
          .eq('user_id', userId)
          .gte('start_time', w0.toISOString())
          .lt('start_time', w1.toISOString())
          .abortSignal(abortSignal ?? new AbortController().signal),
        2300
      ),
      withServerPerf(
        '/dashboard',
        'next_shift_lookup',
        supabase
          .from('rota_shifts')
          .select('start_time,end_time,role_label')
          .eq('user_id', userId)
          .gte('start_time', now.toISOString())
          .order('start_time', { ascending: true })
          .limit(1)
          .abortSignal(abortSignal ?? new AbortController().signal),
        2300
      ),
      withServerPerf(
        '/dashboard',
        'recent_broadcasts',
        supabase
          .from('broadcasts')
          .select(
            'id,title,body,sent_at,dept_id,channel_id,team_id,created_by,is_mandatory,is_pinned,is_org_wide'
          )
          .eq('org_id', orgId)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(3)
          .abortSignal(options?.abortSignal ?? new AbortController().signal),
        2300
      ),
      withServerPerf(
        '/dashboard',
        'upcoming_calendar_events',
        supabase
          .from('calendar_events')
          .select('id,title,start_time')
          .eq('org_id', orgId)
          .gte('start_time', now.toISOString())
          .order('start_time', { ascending: true })
          .limit(5)
          .abortSignal(abortSignal ?? new AbortController().signal),
        2300
      ),
      withServerPerf(
        '/dashboard',
        'upcoming_shifts_calendar',
        supabase
          .from('rota_shifts')
          .select('id,start_time,role_label')
          .eq('user_id', userId)
          .gte('start_time', now.toISOString())
          .lt('start_time', monthEnd.toISOString())
          .order('start_time', { ascending: true })
          .limit(8)
          .abortSignal(abortSignal ?? new AbortController().signal),
        2300
      ),
      withServerPerf('/dashboard', 'unread_count', unreadRpcPromise, 1200),
    ]);
  // #region agent log
  fetch('http://127.0.0.1:7879/ingest/38107b8d-e094-4a22-bf69-bb908cf9d00f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1d19'},body:JSON.stringify({sessionId:'4c1d19',runId:'run1',hypothesisId:'H2',location:'loadDashboardHome.ts:postPromiseAll',message:'Dashboard query bundle completed',data:{durationMs:Date.now()-dashboardQueryStartedAt,recentRawCount:Array.isArray(recentRawRes?.data)?recentRawRes.data.length:-1,calendarCount:Array.isArray(eventsRawRes?.data)?eventsRawRes.data.length:-1,shiftCalendarCount:Array.isArray(shiftCalendarRawRes?.data)?shiftCalendarRawRes.data.length:-1,shiftsWeekCount:shiftsWeekRes?.count ?? null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const shiftsThisWeek = shiftsWeekRes.count;
  const nextShifts = nextShiftRes.data;
  const recentRaw = recentRawRes.data;
  const eventsRaw = eventsRawRes.data;
  const shiftCalendarRaw = shiftCalendarRawRes.data;

  const recentBroadcasts = await enrichBroadcastRows(
    supabase,
    userId,
    (recentRaw ?? []) as RawBroadcast[]
  );
  // #region agent log
  fetch('http://127.0.0.1:7879/ingest/38107b8d-e094-4a22-bf69-bb908cf9d00f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1d19'},body:JSON.stringify({sessionId:'4c1d19',runId:'run1',hypothesisId:'H3',location:'loadDashboardHome.ts:recentBroadcasts',message:'Broadcast enrichment result',data:{rawCount:Array.isArray(recentRaw)?recentRaw.length:-1,enrichedCount:Array.isArray(recentBroadcasts)?recentBroadcasts.length:-1},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  let pendingCount: number | null = null;
  if (isApproverRole(profile.role) || canFinalApproveRotaRequests(profile.role)) {
    if (useCachedPendingApprovals) {
      const navN = options?.initialPendingApprovals;
      pendingCount =
        navN === null || navN === undefined ? 0 : typeof navN === 'number' ? navN : Number(navN);
    } else {
      const navRes = await supabase
        .rpc('pending_approvals_nav_count')
        .abortSignal(abortSignal ?? new AbortController().signal);
      const navN = navRes?.data;
      pendingCount =
        navN === null || navN === undefined ? 0 : typeof navN === 'number' ? navN : Number(navN);
    }
  }

  const unreadRaw = unreadRpc.data;
  const unreadCount =
    unreadRaw === null || unreadRaw === undefined
      ? 0
      : typeof unreadRaw === 'number'
        ? unreadRaw
        : Number(unreadRaw);

  const eventColors = ['#44403c', '#059669', '#7C3AED', '#C2410C', '#E11D48'];
  const upcomingCalendarEvents: UpcomingEventRow[] = (eventsRaw ?? []).map((e: { id: string; title: string; start_time: string }, i: number) => ({
    id: e.id as string,
    title: e.title as string,
    start_time: e.start_time as string,
    color: eventColors[i % eventColors.length]!,
    kind: 'event',
  }));

  const upcomingShiftRows: UpcomingEventRow[] = (shiftCalendarRaw ?? []).map((s: { id: string; start_time: string; role_label: string | null }) => ({
    id: `shift-${String(s.id)}`,
    title: ((s.role_label as string | null)?.trim() || 'Upcoming shift'),
    start_time: s.start_time as string,
    color: '#2563EB',
    kind: 'shift',
  }));

  const upcomingEvents = [...upcomingCalendarEvents, ...upcomingShiftRows]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5);

  const calendarEventDays = [...upcomingCalendarEvents, ...upcomingShiftRows]
    .map((e) => {
      const ev = calendarYmdInTimeZone(new Date(e.start_time as string), orgTz);
      if (ev.y !== calToday.y || ev.m !== calToday.m) return null;
      return ev.d;
    })
    .filter((x): x is number => x !== null);

  const ns = nextShifts?.[0] as
    | { start_time: string; end_time: string; role_label: string | null }
    | undefined;
  let nextShiftSummary: string | null = null;
  if (ns) {
    const st = new Date(ns.start_time);
    const label = ns.role_label?.trim() || 'Shift';
    nextShiftSummary = `${label} · ${st.toLocaleString('en-GB', { timeZone: 'UTC',  weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
  }

  return {
    orgName,
    userName: profile.full_name?.trim() || 'there',
    profileRole: profile.role,
    ...(statCounts
      ? {
          ...(statCounts.broadcastTotal !== undefined ? { broadcastTotal: statCounts.broadcastTotal } : {}),
          memberActiveTotal: statCounts.memberActiveTotal,
          dashboardStatScope: statCounts.statScope,
        }
      : {}),
    pendingCount,
    unreadCount,
    showBroadcastUnreadCount: canViewDashboardUnreadBroadcastKpi(profile.role),
    shiftsThisWeek: shiftsThisWeek ?? 0,
    nextShiftSummary,
    recentBroadcasts,
    upcomingEvents,
    calendarEventDays,
    calendarYear: calToday.y,
    calendarMonth: calToday.m - 1,
    calendarTodayY: calToday.y,
    calendarTodayM: calToday.m - 1,
    calendarTodayD: calToday.d,
    dashboardDataFreshness: 'fresh',
    dashboardLastSuccessAt: Date.now(),
    dashboardPartialData: false,
    dashboardPartialSections: [],
  };
}

export async function loadDashboardHomeGuarded(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  profile: { full_name: string | null; role: string },
  options?: { initialBroadcastUnread?: number; initialPendingApprovals?: number; manualRefresh?: boolean }
): Promise<DashboardHomeModel> {
  const key = dashboardCacheKey(userId, orgId, profile.role);
  const manualRefresh = options?.manualRefresh === true;
  if (manualRefresh) {
    await invalidateSharedCache('campsite:dashboard:home', key);
  }

  return getOrLoadSharedCachedValue({
    cache: dashboardHomeResponseCache,
    inFlight: dashboardHomeInFlight,
    key,
    cacheNamespace: 'campsite:dashboard:home',
    ttlMs: DASHBOARD_HOME_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      return loadDashboardHome(supabase, userId, orgId, profile, options);
    },
  });
}
