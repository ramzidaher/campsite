import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { normalizeUiMode } from '@/lib/uiMode';

const HR_DASH_STATS_TIMEOUT_MS = 1200;

async function resolveWithTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: any): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return (await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

  const supabase = await createClient();

  const { data: profile } = await withServerPerf(
    perfPath,
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

  const permissionKeys = await withServerPerf(perfPath, 'get_my_permissions', getMyPermissions(orgId), 300);

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const canManage = permissionKeys.includes('hr.manage_records');
  const canManagePerformanceCycles = permissionKeys.includes('performance.manage_cycles');

  const [rows, dashStats] = await Promise.all([
    withServerPerf(
      perfPath,
      'hr_directory_list',
      supabase.rpc('hr_directory_list').then(({ data }) => data ?? []),
      500
    ),
    canViewAll
      ? resolveWithTimeout(
          withServerPerf(
            perfPath,
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
  warnIfSlowServerPath(perfPath, pathStartedAtMs);
  return view;
}
