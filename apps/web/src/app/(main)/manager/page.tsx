import { ManagerDashboardClient } from '@/components/admin/ManagerDashboardClient';
import { endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function ManagerDashboardPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') {
    redirect('/broadcasts');
  }
  const permissionKeys = await withServerPerf('/manager', 'get_my_permissions', getMyPermissions(profile.org_id as string), 300);
  const canViewDepartments   = permissionKeys.includes('departments.view');
  const canCreateRecruitment = permissionKeys.includes('recruitment.create_request');
  if (!canViewDepartments && !canCreateRecruitment) redirect('/broadcasts');

  if (!canCreateRecruitment) {
    redirect('/manager/teams');
  }

  const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', user.id);
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
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .eq('status', 'pending_approval')
        .in('dept_id', deptIds),
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .eq('status', 'sent')
        .in('dept_id', deptIds)
        .gte('sent_at', weekStart.toISOString())
        .lt('sent_at', weekEnd.toISOString()),
      supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString()),
      supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString()),
      supabase
        .from('calendar_events')
        .select('id,title,start_time')
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(4),
      supabase
        .from('rota_shifts')
        .select('id,start_time,role_label')
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(4),
    ]);

    departmentNames = (departments ?? [])
      .map((d) => (typeof d.name === 'string' ? d.name.trim() : ''))
      .filter(Boolean);
    const deptNameById = new Map(
      (departments ?? []).map((d) => [String(d.id), typeof d.name === 'string' ? d.name : 'Department'])
    );

    pendingBroadcasts = bcPending ?? 0;
    broadcastsThisWeek = bcWeek ?? 0;
    shiftsWeek = shWeek ?? 0;
    shiftsToday = shToday ?? 0;
    teamsCount = teamRows?.length ?? 0;

    const memberIds = [...new Set((udRows ?? []).map((r) => String(r.user_id)).filter(Boolean))];
    totalMembers = memberIds.length;
    if (memberIds.length) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id,status')
        .eq('org_id', profile.org_id)
        .in('id', memberIds);
      const rows = profileRows ?? [];
      pendingUsers = rows.filter((r) => r.status === 'pending').length;
      activeUsers = rows.filter((r) => r.status === 'active').length;
    }

    const membersByDept = new Map<string, Set<string>>();
    for (const row of udRows ?? []) {
      const deptId = String(row.dept_id ?? '');
      const userId = String(row.user_id ?? '');
      if (!deptId || !userId) continue;
      if (!membersByDept.has(deptId)) membersByDept.set(deptId, new Set());
      membersByDept.get(deptId)?.add(userId);
    }

    const { data: shiftsByDeptRaw } = await withServerPerf(
      '/manager',
      'shifts_by_dept_week',
      supabase
        .from('rota_shifts')
        .select('id,dept_id')
        .eq('org_id', profile.org_id)
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

  const view = (
    <ManagerDashboardClient
      stats={{
        pendingUsers,
        activeUsers,
        totalMembers,
        pendingBroadcasts,
        broadcastsThisWeek,
        shiftsWeek,
        shiftsToday,
        teamsCount,
      }}
      hasDepartments={deptIds.length > 0}
      departmentNames={departmentNames}
      upcomingItems={upcomingItems}
      departmentBreakdown={departmentBreakdown}
    />
  );
  warnIfSlowServerPath('/manager', pathStartedAtMs);
  return view;
}
