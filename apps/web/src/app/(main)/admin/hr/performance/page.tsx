import { PerformanceCyclesClient } from '@/components/admin/hr/performance/PerformanceCyclesClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PerformanceCyclesPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/performance',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const supabase = await createClient();
  const canManage = permissionKeys.includes('performance.manage_cycles');
  const canView   = permissionKeys.includes('performance.view_reports');

  if (!canManage && !canView) redirect('/admin');

  const { data: cycles } = await withServerPerf(
    '/admin/hr/performance',
    'review_cycles_lookup',
    supabase
      .from('review_cycles')
      .select('id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false }),
    400
  );

  // get review counts per cycle
  const cycleIds = (cycles ?? []).map((c) => c.id as string);
  const reviewCounts: Record<string, { total: number; completed: number }> = {};
  if (cycleIds.length) {
    const { data: counts } = await withServerPerf(
      '/admin/hr/performance',
      'performance_review_counts',
      supabase
        .from('performance_reviews')
        .select('cycle_id, status')
        .eq('org_id', orgId)
        .in('cycle_id', cycleIds),
      400
    );
    for (const r of counts ?? []) {
      const cid = r.cycle_id as string;
      if (!reviewCounts[cid]) reviewCounts[cid] = { total: 0, completed: 0 };
      reviewCounts[cid]!.total++;
      if (r.status === 'completed') reviewCounts[cid]!.completed++;
    }
  }

  const view = (
    <PerformanceCyclesClient
      canManage={canManage}
      canViewCycleDetail={canManage}
      cycles={(cycles ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        type: c.type as string,
        status: c.status as string,
        period_start: c.period_start as string,
        period_end: c.period_end as string,
        self_assessment_due: (c.self_assessment_due as string | null) ?? null,
        manager_assessment_due: (c.manager_assessment_due as string | null) ?? null,
        created_at: c.created_at as string,
        review_total: reviewCounts[c.id as string]?.total ?? 0,
        review_completed: reviewCounts[c.id as string]?.completed ?? 0,
      }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/performance', pathStartedAtMs);
  return view;
}
