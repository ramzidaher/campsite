import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getCachedHrDirectoryPageData } from '@/lib/hr/getCachedHrDirectoryPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { normalizeUiMode } from '@/lib/uiMode';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
  shellBundleUiMode,
} from '@/lib/shell/shellBundleAccess';

/**
 * Shared server page for the HR employee directory (canonical URL `/hr/people`).
 * `perfPath` is used for slow-path logging and RPC perf labels.
 */
export async function HrDirectoryPage({
  searchParams,
  perfPath = '/hr/people',
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
  perfPath?: string;
}) {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const bundle = await withServerPerf(perfPath, 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const canManage = permissionKeys.includes('hr.manage_records');
  const canManagePerformanceCycles = permissionKeys.includes('performance.manage_cycles');
  const { rows, dashStats } = await withServerPerf(
    perfPath,
    'hr_directory_bundle_cached',
    getCachedHrDirectoryPageData(orgId, user.id, canViewAll, false),
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
      initialUiMode={normalizeUiMode(shellBundleUiMode(bundle))}
    />
  );
  warnIfSlowServerPath(perfPath, pathStartedAtMs);
  return view;
}
