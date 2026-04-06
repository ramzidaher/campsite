import { LeaveHubClient } from '@/components/leave/LeaveHubClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LeavePage() {
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

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
  const keys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));

  const canView =
    keys.includes('leave.view_own') ||
    keys.includes('leave.approve_direct_reports') ||
    keys.includes('leave.manage_org');
  if (!canView) redirect('/broadcasts');

  const canSubmit = keys.includes('leave.submit');
  const canApprove = keys.includes('leave.approve_direct_reports') || keys.includes('leave.manage_org');
  const canManage = keys.includes('leave.manage_org');
  let showPerformanceTab = false;
  let showOnboardingTab = false;

  if (keys.includes('performance.view_own') || keys.includes('performance.review_direct_reports')) {
    const { count: reviewCount } = await supabase
      .from('performance_reviews')
      .select('id', { count: 'exact', head: true })
      .or(`reviewee_id.eq.${user.id},reviewer_id.eq.${user.id}`);
    showPerformanceTab = (reviewCount ?? 0) > 0;
  }

  if (keys.includes('onboarding.complete_own_tasks')) {
    const { count: runCount } = await supabase
      .from('onboarding_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active');
    showOnboardingTab = (runCount ?? 0) > 0;
  }

  const initialYear = String(new Date().getFullYear());

  return (
    <LeaveHubClient
      orgId={orgId}
      userId={user.id}
      canSubmit={canSubmit}
      canApprove={canApprove}
      canManage={canManage}
      initialYear={initialYear}
      showPerformanceTab={showPerformanceTab}
      showOnboardingTab={showOnboardingTab}
    />
  );
}
