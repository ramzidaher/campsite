import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createClient();
  const scopedWithoutDept = !viewer.orgWideDataAccess && !viewer.departmentId;
  const scopedUserIds =
    !viewer.orgWideDataAccess && viewer.departmentId
      ? (
          await supabase
            .from('profiles')
            .select('id')
            .eq('org_id', viewer.orgId)
            .eq('status', 'active')
            .eq('department_id', viewer.departmentId)
            .limit(3000)
        ).data?.map((row) => String(row.id)) ?? []
      : null;
  const hasScopedUsers = scopedUserIds === null || scopedUserIds.length > 0;
  const today = new Date().toISOString().slice(0, 10);

  const leaveQuery = supabase
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', viewer.orgId)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today);
  const timesheetQuery = supabase
    .from('weekly_timesheets')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', viewer.orgId)
    .eq('status', 'pending');
  const reviewsQuery = supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', viewer.orgId)
    .eq('status', 'pending_manager');

  const [pinnedRes, recentRunsRes, schedulesRes, profileRes, leaveRes, timesheetsRes, perfRes, hiringKpiRes] = await Promise.all([
    supabase
      .from('user_pinned_reports')
      .select('report_id, pinned_at, reports!inner(id, name, domains, visibility, updated_at)')
      .eq('user_id', viewer.userId)
      .order('pinned_at', { ascending: false })
      .limit(6),
    supabase
      .from('report_runs')
      .select('id, report_id, row_count, created_at, reports!inner(name)')
      .eq('org_id', viewer.orgId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('report_schedules')
      .select('id, report_id, next_run_at, is_paused, reports!inner(name)')
      .eq('org_id', viewer.orgId)
      .eq('is_paused', false)
      .order('next_run_at', { ascending: true })
      .limit(8),
    (scopedWithoutDept
      ? Promise.resolve({ count: 0 } as { count: number | null })
      : viewer.orgWideDataAccess
      ? supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', viewer.orgId).eq('status', 'active')
      : supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', viewer.orgId)
          .eq('status', 'active')
          .eq('department_id', viewer.departmentId)),
    scopedWithoutDept || !hasScopedUsers ? Promise.resolve({ count: 0 } as { count: number | null }) : scopedUserIds ? leaveQuery.in('user_id', scopedUserIds) : leaveQuery,
    scopedWithoutDept || !hasScopedUsers
      ? Promise.resolve({ count: 0 } as { count: number | null })
      : scopedUserIds
      ? timesheetQuery.in('user_id', scopedUserIds)
      : timesheetQuery,
    scopedWithoutDept || !hasScopedUsers
      ? Promise.resolve({ count: 0 } as { count: number | null })
      : scopedUserIds
      ? reviewsQuery.in('user_id', scopedUserIds)
      : reviewsQuery,
    supabase.rpc('hiring_kpi_summary', { p_org_id: viewer.orgId }),
  ]);

  const hiringKpis = (hiringKpiRes.data ?? {}) as Record<string, number>;

  return NextResponse.json({
    pinned: pinnedRes.data ?? [],
    recentRuns: recentRunsRes.data ?? [],
    upcomingSchedules: schedulesRes.data ?? [],
    metrics: {
      totalHeadcount: profileRes.count ?? 0,
      activeAbsencesToday: leaveRes.count ?? 0,
      timesheetsPendingApproval: timesheetsRes.count ?? 0,
      overduePerformanceReviews: perfRes.count ?? 0,
      hiringRequisitionsPending: Number(hiringKpis.requisitions_pending ?? 0),
      hiringStartsConfirmed: Number(hiringKpis.starts_confirmed ?? 0),
    },
    capabilities: {
      canManage: viewer.canManage,
      orgWideDataAccess: viewer.orgWideDataAccess,
      departmentScopeApplied: !viewer.orgWideDataAccess && Boolean(viewer.departmentId),
    },
  });
}
