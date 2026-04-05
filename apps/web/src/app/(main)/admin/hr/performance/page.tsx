import { PerformanceCyclesClient } from '@/components/admin/hr/performance/PerformanceCyclesClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PerformanceCyclesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [canManage, canView] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.manage_cycles', p_context: {} }).then(({ data }) => !!data),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'performance.view_reports', p_context: {} }).then(({ data }) => !!data),
  ]);

  if (!canManage && !canView) redirect('/admin');

  const { data: cycles } = await supabase
    .from('review_cycles')
    .select('id, name, type, status, period_start, period_end, self_assessment_due, manager_assessment_due, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  // get review counts per cycle
  const cycleIds = (cycles ?? []).map((c) => c.id as string);
  const reviewCounts: Record<string, { total: number; completed: number }> = {};
  if (cycleIds.length) {
    const { data: counts } = await supabase
      .from('performance_reviews')
      .select('cycle_id, status')
      .eq('org_id', orgId)
      .in('cycle_id', cycleIds);
    for (const r of counts ?? []) {
      const cid = r.cycle_id as string;
      if (!reviewCounts[cid]) reviewCounts[cid] = { total: 0, completed: 0 };
      reviewCounts[cid]!.total++;
      if (r.status === 'completed') reviewCounts[cid]!.completed++;
    }
  }

  return (
    <PerformanceCyclesClient
      orgId={orgId}
      canManage={canManage}
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
}
