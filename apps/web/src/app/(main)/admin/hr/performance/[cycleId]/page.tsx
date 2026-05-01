import { PerformanceCycleDetailClient } from '@/components/admin/hr/performance/PerformanceCycleDetailClient';
import { getCachedPerformanceCycleDetailPageData } from '@/lib/hr/getCachedPerformanceCycleDetailPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function PerformanceCycleDetailPage({ params }: { params: Promise<{ cycleId: string }> }) {
  const pathStartedAtMs = Date.now();
  const { cycleId } = await params;
  const bundle = await withServerPerf(
    '/admin/hr/performance/[cycleId]',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);

  if (!permissionKeys.includes('performance.manage_cycles')) redirect('/hr/performance');

  const pageData = await withServerPerf(
    '/admin/hr/performance/[cycleId]',
    'cached_performance_cycle_detail_page_data',
    getCachedPerformanceCycleDetailPageData(orgId, cycleId),
    650
  );
  const cycle = pageData.cycle;
  const reviews = pageData.reviews;
  const members = pageData.members;
  if (!cycle) redirect('/hr/performance');

  const enrolledIds = new Set(
    (reviews ?? []).map((r: Record<string, unknown>) => String(r.reviewee_id ?? ''))
  );

  const view = (
    <PerformanceCycleDetailClient
      cycleId={cycleId}
      cycle={{
        id: cycle.id,
        name: cycle.name,
        type: cycle.type,
        status: cycle.status,
        period_start: cycle.period_start,
        period_end: cycle.period_end,
        self_assessment_due: cycle.self_assessment_due,
        manager_assessment_due: cycle.manager_assessment_due,
      }}
      reviews={(reviews ?? []).map((r: Record<string, unknown>) => ({
        review_id: r.review_id as string,
        reviewee_id: r.reviewee_id as string,
        reviewee_name: r.reviewee_name as string,
        reviewee_email: (r.reviewee_email as string | null) ?? null,
        reviewer_id: (r.reviewer_id as string | null) ?? null,
        reviewer_name: (r.reviewer_name as string | null) ?? null,
        status: r.status as string,
        overall_rating: (r.overall_rating as string | null) ?? null,
        self_submitted_at: (r.self_submitted_at as string | null) ?? null,
        manager_submitted_at: (r.manager_submitted_at as string | null) ?? null,
        completed_at: (r.completed_at as string | null) ?? null,
        goal_count: Number(r.goal_count ?? 0),
      }))}
      members={(members ?? [])
        .filter((m) => !enrolledIds.has(m.id))
        .map((m) => ({
          id: m.id,
          full_name: m.full_name,
          email: m.email ?? null,
        }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/performance/[cycleId]', pathStartedAtMs);
  return view;
}
