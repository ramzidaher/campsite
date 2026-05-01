import { cache } from 'react';

import { endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { createClient } from '@/lib/supabase/server';

export type ManagerDashboardPageData = {
  deptIds: string[];
  pendingUsers: number;
  activeUsers: number;
  totalMembers: number;
  pendingBroadcasts: number;
  broadcastsThisWeek: number;
  shiftsWeek: number;
  shiftsToday: number;
  teamsCount: number;
  departmentNames: string[];
  upcomingItems: Array<{ id: string; title: string; start_time: string; kind: 'event' | 'shift' }>;
  departmentBreakdown: Array<{ id: string; name: string; members: number; shiftsWeek: number }>;
};

const MANAGER_DASHBOARD_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_MANAGER_DASHBOARD_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const managerDashboardPageResponseCache = new Map<string, TtlCacheEntry<ManagerDashboardPageData>>();
const managerDashboardPageInFlight = new Map<string, Promise<ManagerDashboardPageData>>();
registerSharedCacheStore('campsite:manager:dashboard', managerDashboardPageResponseCache, managerDashboardPageInFlight);

function getManagerDashboardPageCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedManagerDashboardPageData = cache(
  async (orgId: string, userId: string): Promise<ManagerDashboardPageData> => {
    return getOrLoadSharedCachedValue({
      cache: managerDashboardPageResponseCache,
      inFlight: managerDashboardPageInFlight,
      key: getManagerDashboardPageCacheKey(orgId, userId),
      cacheNamespace: 'campsite:manager:dashboard',
      ttlMs: MANAGER_DASHBOARD_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', userId);
        const deptIds = (managed ?? []).map((m) => m.dept_id as string);

        let pendingUsers = 0;
        let activeUsers = 0;
        let totalMembers = 0;
        let pendingBroadcasts = 0;
        let broadcastsThisWeek = 0;
        let shiftsWeek = 0;
        let shiftsToday = 0;
        let teamsCount = 0;
        let departmentNames: string[] = [];
        let upcomingItems: Array<{ id: string; title: string; start_time: string; kind: 'event' | 'shift' }> = [];
        let departmentBreakdown: Array<{ id: string; name: string; members: number; shiftsWeek: number }> = [];

        if (deptIds.length) {
          const now = new Date();
          const weekStart = startOfWeekMonday(now);
          const weekEnd = endOfWeekExclusive(weekStart);
          const dayStart = new Date(now);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const [
            { data: departments },
            { data: udRows },
            { data: teamRows },
            { count: bcPending },
            { count: bcWeek },
            { count: shWeek },
            { count: shToday },
            { data: eventRows },
            { data: upcomingShiftRows },
          ] = await Promise.all([
            withServerPerf('/manager', 'departments_for_manager', supabase.from('departments').select('id,name').in('id', deptIds), 350),
            withServerPerf('/manager', 'user_departments_for_manager', supabase.from('user_departments').select('user_id,dept_id').in('dept_id', deptIds), 350),
            withServerPerf('/manager', 'team_rows_for_manager', supabase.from('department_teams').select('id').in('dept_id', deptIds), 350),
            supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending_approval').in('dept_id', deptIds),
            supabase
              .from('broadcasts')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .eq('status', 'sent')
              .in('dept_id', deptIds)
              .gte('sent_at', weekStart.toISOString())
              .lt('sent_at', weekEnd.toISOString()),
            supabase
              .from('rota_shifts')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .in('dept_id', deptIds)
              .gte('start_time', weekStart.toISOString())
              .lt('start_time', weekEnd.toISOString()),
            supabase
              .from('rota_shifts')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', orgId)
              .in('dept_id', deptIds)
              .gte('start_time', dayStart.toISOString())
              .lt('start_time', dayEnd.toISOString()),
            supabase
              .from('calendar_events')
              .select('id,title,start_time')
              .eq('org_id', orgId)
              .in('dept_id', deptIds)
              .gte('start_time', now.toISOString())
              .order('start_time', { ascending: true })
              .limit(4),
            supabase
              .from('rota_shifts')
              .select('id,start_time,role_label')
              .eq('org_id', orgId)
              .in('dept_id', deptIds)
              .gte('start_time', now.toISOString())
              .order('start_time', { ascending: true })
              .limit(4),
          ]);

          departmentNames = (departments ?? []).map((d) => (typeof d.name === 'string' ? d.name.trim() : '')).filter(Boolean);
          const deptNameById = new Map((departments ?? []).map((d) => [String(d.id), typeof d.name === 'string' ? d.name : 'Department']));
          pendingBroadcasts = bcPending ?? 0;
          broadcastsThisWeek = bcWeek ?? 0;
          shiftsWeek = shWeek ?? 0;
          shiftsToday = shToday ?? 0;
          teamsCount = teamRows?.length ?? 0;

          const memberIds = [...new Set((udRows ?? []).map((r) => String(r.user_id)).filter(Boolean))];
          totalMembers = memberIds.length;
          if (memberIds.length) {
            const { data: profileRows } = await supabase.from('profiles').select('id,status').eq('org_id', orgId).in('id', memberIds);
            const rows = profileRows ?? [];
            pendingUsers = rows.filter((r) => r.status === 'pending').length;
            activeUsers = rows.filter((r) => r.status === 'active').length;
          }

          const membersByDept = new Map<string, Set<string>>();
          for (const row of udRows ?? []) {
            const deptId = String(row.dept_id ?? '');
            const memberId = String(row.user_id ?? '');
            if (!deptId || !memberId) continue;
            if (!membersByDept.has(deptId)) membersByDept.set(deptId, new Set());
            membersByDept.get(deptId)?.add(memberId);
          }

          const { data: shiftsByDeptRaw } = await withServerPerf(
            '/manager',
            'shifts_by_dept_week',
            supabase
              .from('rota_shifts')
              .select('id,dept_id')
              .eq('org_id', orgId)
              .in('dept_id', deptIds)
              .gte('start_time', weekStart.toISOString())
              .lt('start_time', weekEnd.toISOString()),
            400
          );
          const shiftsByDept = new Map<string, number>();
          for (const row of shiftsByDeptRaw ?? []) {
            const deptId = String(row.dept_id ?? '');
            if (!deptId) continue;
            shiftsByDept.set(deptId, (shiftsByDept.get(deptId) ?? 0) + 1);
          }

          departmentBreakdown = deptIds.map((deptId) => ({
            id: deptId,
            name: deptNameById.get(deptId) ?? 'Department',
            members: membersByDept.get(deptId)?.size ?? 0,
            shiftsWeek: shiftsByDept.get(deptId) ?? 0,
          }));

          const upcomingEvents = (eventRows ?? []).map((e) => ({
            id: String(e.id),
            title: String(e.title ?? 'Upcoming event'),
            start_time: String(e.start_time),
            kind: 'event' as const,
          }));
          const upcomingShifts = (upcomingShiftRows ?? []).map((s) => ({
            id: `shift-${String(s.id)}`,
            title: String((s.role_label as string | null)?.trim() || 'Upcoming shift'),
            start_time: String(s.start_time),
            kind: 'shift' as const,
          }));
          upcomingItems = [...upcomingEvents, ...upcomingShifts]
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            .slice(0, 6);
        }

        return {
          deptIds,
          pendingUsers,
          activeUsers,
          totalMembers,
          pendingBroadcasts,
          broadcastsThisWeek,
          shiftsWeek,
          shiftsToday,
          teamsCount,
          departmentNames,
          upcomingItems,
          departmentBreakdown,
        };
      },
    });
  }
);
