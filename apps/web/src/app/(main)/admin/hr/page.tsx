import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
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
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = await createClient();

  const { data: profile } = await withServerPerf(
    '/admin/hr',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status, ui_mode')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  // Use the cached permissions — layout already called getMyPermissions(orgId),
  // so this is a free cache hit with no DB round trip.
  const permissionKeys = await withServerPerf('/admin/hr', 'get_my_permissions', getMyPermissions(orgId), 300);

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
      initialUiMode={normalizeUiMode(profile.ui_mode)}
    />
  );
  warnIfSlowServerPath('/admin/hr', pathStartedAtMs);
  return view;
}
