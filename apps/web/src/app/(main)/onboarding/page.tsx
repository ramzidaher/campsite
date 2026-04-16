import { EmployeeOnboardingClient } from '@/components/onboarding/EmployeeOnboardingClient';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function EmployeeOnboardingPage() {
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

  // find the most recent active or recently completed run for this user
  const { data: run } = await supabase
    .from('onboarding_runs')
    .select('id, status, employment_start_date, created_at')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .in('status', ['active', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) redirect('/broadcasts');

  const [{ data: tasks }, permissionKeys] = await Promise.all([
    supabase
      .from('onboarding_run_tasks')
      .select('id, title, description, assignee_type, category, due_date, sort_order, status, completed_at')
      .eq('run_id', run.id as string)
      .eq('org_id', orgId)
      .order('sort_order'),
    getMyPermissions(orgId),
  ]);
  const canComplete = permissionKeys.includes('onboarding.complete_own_tasks');

  return (
    <EmployeeOnboardingClient
      runId={run.id as string}
      runStatus={run.status as string}
      employmentStartDate={run.employment_start_date as string}
      canComplete={canComplete}
      tasks={(tasks ?? []).map((t) => ({
        id: t.id as string,
        title: t.title as string,
        description: (t.description as string | null) ?? null,
        assignee_type: t.assignee_type as string,
        category: t.category as string,
        due_date: (t.due_date as string | null) ?? null,
        sort_order: t.sort_order as number,
        status: t.status as string,
        completed_at: (t.completed_at as string | null) ?? null,
      }))}
    />
  );
}
