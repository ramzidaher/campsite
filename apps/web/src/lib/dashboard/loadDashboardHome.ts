import 'server-only';

import { fetchDashboardStatCounts } from '@campsite/api';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canViewDashboardUnreadBroadcastKpi, isApproverRole } from '@campsite/types';

import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { enrichBroadcastRows } from '@/lib/broadcasts/enrichBroadcastRows';
import type { FeedRow, RawBroadcast } from '@/lib/broadcasts/feedTypes';

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
};

export type DashboardHomeModel = {
  orgName: string;
  userName: string;
  profileRole: string;
  /** Sent broadcasts count; omitted when the viewer must not see KPI tiles. */
  broadcastTotal?: number;
  /** Active members count (org- or dept-scoped); omitted when the viewer must not see KPI tiles. */
  memberActiveTotal?: number;
  /** How KPI counts were computed — drives dashboard copy. */
  dashboardStatScope?: 'org' | 'dept';
  pendingCount: number | null;
  unreadCount: number;
  shiftsThisWeek: number;
  nextShiftSummary: string | null;
  recentBroadcasts: FeedRow[];
  pendingPreview: PendingPreviewRow[];
  upcomingEvents: UpcomingEventRow[];
  calendarEventDays: number[];
  calendarYear: number;
  calendarMonth: number;
  /** When false, stat row uses a neutral broadcasts link instead of unread count (society_leader). */
  showBroadcastUnreadCount?: boolean;
};

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
    deptLine: p.departments.length ? p.departments.join(', ') : '—',
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
  profile: { full_name: string | null; role: string }
): Promise<DashboardHomeModel> {
  const { data: orgRow } = await supabase.from('organisations').select('name').eq('id', orgId).single();
  const orgName = (orgRow?.name as string) ?? 'Organisation';

  const now = new Date();
  const w0 = startOfLocalWeek(now);
  const w1 = endOfLocalWeek(now);

  const unreadRpcPromise = canViewDashboardUnreadBroadcastKpi(profile.role)
    ? supabase.rpc('broadcast_unread_count')
    : Promise.resolve({ data: 0, error: null });

  const [
    statCounts,
    { count: shiftsThisWeek },
    { data: nextShifts },
    { data: recentRaw },
    { data: eventsRaw },
    unreadRpc,
  ] = await Promise.all([
    fetchDashboardStatCounts(supabase, { userId, orgId, role: profile.role }),
    supabase
      .from('rota_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('start_time', w0.toISOString())
      .lt('start_time', w1.toISOString()),
    supabase
      .from('rota_shifts')
      .select('start_time,end_time,role_label')
      .eq('user_id', userId)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(1),
    supabase
      .from('broadcasts')
      .select(
        'id,title,body,sent_at,dept_id,channel_id,team_id,created_by,is_mandatory,is_pinned,is_org_wide'
      )
      .eq('org_id', orgId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(4),
    supabase
      .from('calendar_events')
      .select('id,title,start_time')
      .eq('org_id', orgId)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(5),
    unreadRpcPromise,
  ]);

  const recentBroadcasts = await enrichBroadcastRows(
    supabase,
    userId,
    (recentRaw ?? []) as RawBroadcast[]
  );

  let pendingPreview: PendingPreviewRow[] = [];
  let pendingCount: number | null = null;
  if (isApproverRole(profile.role)) {
    const full = await loadPendingApprovalsPreview(supabase, userId, orgId, profile.role);
    pendingCount = full.length;
    pendingPreview = full.slice(0, 3);
  }

  const unreadRaw = unreadRpc.data;
  const unreadCount =
    unreadRaw === null || unreadRaw === undefined
      ? 0
      : typeof unreadRaw === 'number'
        ? unreadRaw
        : Number(unreadRaw);

  const eventColors = ['#1D4ED8', '#059669', '#7C3AED', '#C2410C', '#E11D48'];
  const upcomingEvents: UpcomingEventRow[] = (eventsRaw ?? []).map((e, i) => ({
    id: e.id as string,
    title: e.title as string,
    start_time: e.start_time as string,
    color: eventColors[i % eventColors.length]!,
  }));

  const calendarEventDays = upcomingEvents
    .map((e) => {
      const dt = new Date(e.start_time);
      if (dt.getFullYear() !== now.getFullYear() || dt.getMonth() !== now.getMonth()) return null;
      return dt.getDate();
    })
    .filter((x): x is number => x !== null);

  const ns = nextShifts?.[0] as
    | { start_time: string; end_time: string; role_label: string | null }
    | undefined;
  let nextShiftSummary: string | null = null;
  if (ns) {
    const st = new Date(ns.start_time);
    const label = ns.role_label?.trim() || 'Shift';
    nextShiftSummary = `${label} · ${st.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
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
    pendingPreview,
    upcomingEvents,
    calendarEventDays,
    calendarYear: now.getFullYear(),
    calendarMonth: now.getMonth(),
  };
}
