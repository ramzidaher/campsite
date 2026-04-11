import { fetchDashboardStatCounts } from '@campsite/api';
import { canViewDashboardStatTiles } from '@campsite/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';
import { fetchMobileBroadcastFeedPage } from '@/lib/broadcastFeedQuery';

export type HomeUpcomingEvent = {
  id: string;
  title: string;
  start_time: string;
  color: string;
};

export type ProbationAlertItem = {
  role: string;
  user_id: string;
  display_name: string;
  probation_end_date: string;
  alert_level: 'due_soon' | 'overdue' | 'critical';
};

export type MobileHomeData = {
  orgName: string;
  stats: Awaited<ReturnType<typeof fetchDashboardStatCounts>>;
  recentBroadcasts: MobileBroadcastRow[];
  upcomingEvents: HomeUpcomingEvent[];
  calendarEventDays: number[];
  calendarYear: number;
  calendarMonth: number;
  probationAlerts: ProbationAlertItem[];
};

const EVENT_COLORS = ['#44403c', '#059669', '#7C3AED', '#C2410C', '#E11D48'];

export async function loadMobileHomeData(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
  role: string,
): Promise<MobileHomeData> {
  const now = new Date();
  const loadKpis = canViewDashboardStatTiles(role);

  const [{ data: orgRow }, statCounts, feedPage, { data: eventsRaw }, probationRes] = await Promise.all([
    supabase.from('organisations').select('name').eq('id', orgId).single(),
    loadKpis
      ? fetchDashboardStatCounts(supabase, { userId, orgId, role })
      : Promise.resolve(null),
    fetchMobileBroadcastFeedPage(supabase, userId, orgId, 0, 8, {}),
    supabase
      .from('calendar_events')
      .select('id,title,start_time')
      .eq('org_id', orgId)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(8),
    supabase.rpc('my_probation_alerts'),
  ]);

  const orgName = (orgRow?.name as string) ?? 'Organisation';

  const rawProbation = (probationRes.data as { items?: ProbationAlertItem[] } | null)?.items ?? [];
  const probationAlerts = rawProbation.filter((i) => {
    if (i.user_id === userId) return true;
    return i.role === 'manager';
  });

  const upcomingEvents: HomeUpcomingEvent[] = (eventsRaw ?? []).map((e, i) => ({
    id: e.id as string,
    title: e.title as string,
    start_time: e.start_time as string,
    color: EVENT_COLORS[i % EVENT_COLORS.length]!,
  }));

  const calendarEventDays = upcomingEvents
    .map((ev) => {
      const dt = new Date(ev.start_time);
      if (dt.getFullYear() !== now.getFullYear() || dt.getMonth() !== now.getMonth()) return null;
      return dt.getDate();
    })
    .filter((x): x is number => x !== null);

  return {
    orgName,
    stats: statCounts,
    recentBroadcasts: feedPage.rows,
    upcomingEvents,
    calendarEventDays,
    calendarYear: now.getFullYear(),
    calendarMonth: now.getMonth(),
    probationAlerts,
  };
}
