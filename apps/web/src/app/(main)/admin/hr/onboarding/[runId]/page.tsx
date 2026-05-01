import { OnboardingRunClient } from '@/components/admin/hr/onboarding/OnboardingRunClient';
import { getCachedOnboardingRunPageData } from '@/lib/hr/getCachedOnboardingRunPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function OnboardingRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const pathStartedAtMs = Date.now();
  const { runId } = await params;
  const bundle = await withServerPerf(
    '/admin/hr/onboarding/[runId]',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const pageData = await withServerPerf(
    '/admin/hr/onboarding/[runId]',
    'cached_onboarding_run_page_data',
    getCachedOnboardingRunPageData(orgId, runId),
    650
  );
  const run = pageData.run;
  const canManageRuns       = permissionKeys.includes('onboarding.manage_runs');
  const canCompleteOwnTasks = permissionKeys.includes('onboarding.complete_own_tasks');

  if (!run) redirect('/hr/onboarding');

  const isSelfRun = (run.user_id as string) === user.id;
  const canActAsManager = canManageRuns;
  const canActAsEmployeeSelf = canCompleteOwnTasks && isSelfRun;

  if (!canActAsManager && !canActAsEmployeeSelf) redirect('/hr/onboarding');
  const tasks = pageData.tasks;
  const employee = pageData.employee;
  const completerNames = pageData.completerNames;

  const view = (
    <OnboardingRunClient
      runId={runId}
      orgId={orgId}
      canManageRuns={canManageRuns}
      canActAsManager={canActAsManager}
      canActAsEmployeeSelf={canActAsEmployeeSelf}
      run={{
        id: run.id as string,
        user_id: run.user_id as string,
        status: run.status as string,
        employment_start_date: run.employment_start_date as string,
        created_at: run.created_at as string,
      }}
      employee={{
        id: employee?.id ?? run.user_id,
        display_name: getDisplayName(employee?.full_name ?? null, employee?.preferred_name ?? null),
        email: employee?.email ?? null,
        avatar_url: employee?.avatar_url ?? null,
      }}
      tasks={(tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? null,
        assignee_type: t.assignee_type,
        category: t.category,
        due_date: t.due_date ?? null,
        sort_order: t.sort_order,
        status: t.status,
        completed_at: t.completed_at ?? null,
        completer_name: t.completed_by ? (completerNames[t.completed_by] ?? 'Unknown') : null,
      }))}
    />
  );
  warnIfSlowServerPath('/admin/hr/onboarding/[runId]', pathStartedAtMs);
  return view;
}
