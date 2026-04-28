import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { getCachedHrDirectoryPageData } from '@/lib/hr/getCachedHrDirectoryPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus, shellBundleUiMode } from '@/lib/shell/shellBundleAccess';
import { redirect } from 'next/navigation';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { normalizeUiMode } from '@/lib/uiMode';

export default async function HRDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const bundle = await withServerPerf('/admin/hr', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const initialUiMode = normalizeUiMode(shellBundleUiMode(bundle));

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const canManage = permissionKeys.includes('hr.manage_records');
  const canManagePerformanceCycles = permissionKeys.includes('performance.manage_cycles');
  const { rows, dashStats } = await withServerPerf(
    '/admin/hr',
    'hr_directory_bundle_cached',
    getCachedHrDirectoryPageData(orgId, user.id, canViewAll, canViewAll),
    800
  );

  const params = (await searchParams) ?? {};
  const qRaw = params.q;
  const initialQuery = (Array.isArray(qRaw) ? qRaw[0] : qRaw ?? '').trim();

  const view = (
    <HRDirectoryClient
      orgId={orgId}
      canManage={canManage}
      canManagePerformanceCycles={canManagePerformanceCycles}
      canViewAll={canViewAll}
      initialRows={(rows ?? []) as Parameters<typeof HRDirectoryClient>[0]['initialRows']}
      dashStats={(dashStats ?? null) as Record<string, unknown> | null}
      initialQuery={initialQuery}
      initialUiMode={initialUiMode}
    />
  );
  warnIfSlowServerPath('/admin/hr', pathStartedAtMs);
  return view;
}
