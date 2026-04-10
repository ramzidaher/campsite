import { PerformanceCycleDetailClient } from '@/components/admin/hr/performance/PerformanceCycleDetailClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function PerformanceCycleDetailPage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const canManage = await supabase
    .rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.manage_cycles', p_context: {} })
    .then(({ data }) => !!data);

  if (!canManage) redirect('/hr/performance');

  const [{ data: cycle }, { data: reviews }, { data: members }] = await Promise.all([
    supabase
      .from('review_cycles')
      .select('id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at')
      .eq('org_id', orgId)
      .eq('id', cycleId)
      .maybeSingle(),
    supabase.rpc('review_cycle_reviews', { p_cycle_id: cycleId }),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
  ]);

  if (!cycle) redirect('/hr/performance');

  const enrolledIds = new Set((reviews ?? []).map((r: { reviewee_id: unknown }) => r.reviewee_id as string));

  return (
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
}
