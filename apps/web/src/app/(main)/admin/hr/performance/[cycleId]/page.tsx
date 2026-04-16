import { PerformanceCycleDetailClient } from '@/components/admin/hr/performance/PerformanceCycleDetailClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const PERF_CYCLE_MEMBERS_TIMEOUT_MS = 1200;

async function resolveWithTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: any): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return (await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function PerformanceCycleDetailPage({ params }: { params: Promise<{ cycleId: string }> }) {
  const pathStartedAtMs = Date.now();
  const { cycleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/hr/performance/[cycleId]',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [permissionKeys, [{ data: cycle }, { data: reviews }, { data: members }]] = await Promise.all([
    withServerPerf('/admin/hr/performance/[cycleId]', 'get_my_permissions', getMyPermissions(orgId), 300),
    Promise.all([
      withServerPerf(
        '/admin/hr/performance/[cycleId]',
        'review_cycle_lookup',
        supabase
          .from('review_cycles')
          .select('id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at')
          .eq('org_id', orgId)
          .eq('id', cycleId)
          .maybeSingle(),
        350
      ),
      withServerPerf('/admin/hr/performance/[cycleId]', 'review_cycle_reviews', supabase.rpc('review_cycle_reviews', { p_cycle_id: cycleId }), 450),
      withServerPerf(
        '/admin/hr/performance/[cycleId]',
        'active_members_lookup',
        resolveWithTimeout(
          supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('org_id', orgId)
            .eq('status', 'active')
            .order('full_name'),
          PERF_CYCLE_MEMBERS_TIMEOUT_MS,
          { data: [], error: null }
        ),
        350
      ),
    ]),
  ]);

  if (!permissionKeys.includes('performance.manage_cycles')) redirect('/hr/performance');
  if (!cycle) redirect('/hr/performance');

  const enrolledIds = new Set((reviews ?? []).map((r: { reviewee_id: unknown }) => r.reviewee_id as string));

  const view = (
    <PerformanceCycleDetailClient
      cycleId={cycleId}
      cycle={{
        id: cycle.id as string,
        name: cycle.name as string,
        type: cycle.type as string,
        status: cycle.status as string,
        period_start: cycle.period_start as string,
        period_end: cycle.period_end as string,
        self_assessment_due: (cycle.self_assessment_due as string | null) ?? null,
        manager_assessment_due: (cycle.manager_assessment_due as string | null) ?? null,
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
        .filter((m) => !enrolledIds.has(m.id as string))
        .map((m) => ({ id: m.id as string, full_name: m.full_name as string, email: (m.email as string | null) ?? null }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/performance/[cycleId]', pathStartedAtMs);
  return view;
}
