import { PerformanceCyclesClient } from '@/components/admin/hr/performance/PerformanceCyclesClient';
import { getCachedPerformanceCyclesPageData } from '@/lib/hr/getCachedPerformanceCyclesPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
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
  const canManage = permissionKeys.includes('performance.manage_cycles');
  const canView   = permissionKeys.includes('performance.view_reports');

  if (!canManage && !canView) redirect('/admin');
  const cycles = await withServerPerf(
    '/admin/hr/performance',
    'performance_cycles_bundle_cached',
    getCachedPerformanceCyclesPageData(orgId),
    500
  );

  const view = (
    <PerformanceCyclesClient
      canManage={canManage}
      canViewCycleDetail={canManage}
      cycles={cycles}
    />
  );
  warnIfSlowServerPath('/admin/hr/performance', pathStartedAtMs);
  return view;
}
