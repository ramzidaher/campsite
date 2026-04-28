import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { normalizeUiMode } from '@/lib/uiMode';

const HR_DASH_STATS_TIMEOUT_MS = 1200;

export default async function HRDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf('/admin/hr', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const supabase = await createClient();
  const initialUiMode =
    typeof bundle.ui_mode === 'string' ? normalizeUiMode(bundle.ui_mode) : normalizeUiMode(null);

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const canManage = permissionKeys.includes('hr.manage_records');
  const canManagePerformanceCycles = permissionKeys.includes('performance.manage_cycles');

  // Both data fetches in parallel — no prior permission round trips needed.
  const [rows, dashStats] = await Promise.all([
    withServerPerf(
      '/admin/hr',
      'hr_directory_list',
      supabase.rpc('hr_directory_list').then(({ data }) => data ?? []),
      500
    ),
    canViewAll
      ? resolveWithTimeout(
          withServerPerf(
            '/admin/hr',
            'hr_dashboard_stats',
            supabase.rpc('hr_dashboard_stats').then(({ data }) => data ?? null),
            400
          ),
          HR_DASH_STATS_TIMEOUT_MS,
          null
        )
      : Promise.resolve(null),
  ]);

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
