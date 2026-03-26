import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { canViewOrgWideDashboardStats, isApproverRole } from '@campsite/types';

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
  /** Org-wide sent count; omitted when the viewer must not see org aggregates. */
  broadcastTotal?: number;
  /** Org-wide active profile count; omitted when the viewer must not see org aggregates. */
  memberActiveTotal?: number;
  /** Active profiles created in the last 7 days — set when `adminOverview` loader option is used. */
  newMembersWeek?: number;
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
};

export type LoadDashboardHomeOptions = {
  /** `/admin` overview: org-wide shift count (next 7 days), new members this week. */
  adminOverview?: boolean;
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
  userId: string,
  orgId: string,
  role: string
): Promise<number> {
  const rows = await loadPendingApprovalsPreview(supabase, userId, orgId, role);
  return rows.length;
}

export async function loadDashboardHome(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  profile: { full_name: string | null; role: string },
  options?: LoadDashboardHomeOptions
): Promise<DashboardHomeModel> {
  const { data: orgRow } = await supabase.from('organisations').select('name').eq('id', orgId).single();
  const orgName = (orgRow?.name as string) ?? 'Organisation';

  const now = new Date();
  const w0 = startOfLocalWeek(now);
  const w1 = endOfLocalWeek(now);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const adminOverview = options?.adminOverview === true;
  const showOrgAggregates = canViewOrgWideDashboardStats(profile.role);

  const broadcastCountQuery = showOrgAggregates
    ? supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'sent')
    : Promise.resolve({ count: null as number | null });

  const memberActiveCountQuery = showOrgAggregates
    ? supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'active')
    : Promise.resolve({ count: null as number | null });

  const shiftsQuery = adminOverview
    ? supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .gte('start_time', now.toISOString())
        .lt('start_time', new Date(now.getTime() + 7 * 86400000).toISOString())
    : supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('start_time', w0.toISOString())
        .lt('start_time', w1.toISOString());

  const newMembersQuery = adminOverview
    ? supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'active')
        .gte('created_at', weekAgo.toISOString())
    : Promise.resolve({ count: 0 as number | null });

  const [
    { count: broadcastTotal },
    { count: memberActiveTotal },
    { count: shiftsThisWeek },
    { count: newMembersWeekCount },
    { data: nextShifts },
    { data: recentRaw },
    { data: eventsRaw },
    unreadRpc,
  ] = await Promise.all([
    broadcastCountQuery,
    memberActiveCountQuery,
    shiftsQuery,
    newMembersQuery,
    supabase
      .from('rota_shifts')
      .select('start_time,end_time,role_label')
      .eq('user_id', userId)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(1),
    supabase
      .from('broadcasts')
      .select('id,title,body,sent_at,dept_id,cat_id,created_by')
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
    supabase.rpc('broadcast_unread_count'),
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
    ...(showOrgAggregates
      ? {
          broadcastTotal: broadcastTotal ?? 0,
          memberActiveTotal: memberActiveTotal ?? 0,
        }
      : {}),
    ...(adminOverview ? { newMembersWeek: newMembersWeekCount ?? 0 } : {}),
    pendingCount,
    unreadCount,
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
