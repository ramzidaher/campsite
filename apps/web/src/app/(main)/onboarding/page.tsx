import { EmployeeOnboardingClient } from '@/components/onboarding/EmployeeOnboardingClient';
import { getCachedEmployeeOnboardingPageData } from '@/lib/hr/getCachedEmployeeOnboardingPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function EmployeeOnboardingPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  const userId = typeof bundle.user_id === 'string' ? bundle.user_id : null;
  if (!orgId || !userId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);

  const pageData = await getCachedEmployeeOnboardingPageData(orgId, userId);
  const run = pageData.run;

  if (!run) redirect('/broadcasts');
  const canComplete = permissionKeys.includes('onboarding.complete_own_tasks');

  return (
    <EmployeeOnboardingClient
      runId={run.id}
      runStatus={run.status}
      employmentStartDate={run.employment_start_date}
      canComplete={canComplete}
      tasks={pageData.tasks}
    />
  );
}
