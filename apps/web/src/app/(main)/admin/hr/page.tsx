import { HRDirectoryClient } from '@/components/admin/hr/HRDirectoryClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { normalizeUiMode } from '@/lib/uiMode';

export default async function HRDirectoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, ui_mode')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  // Use the cached permissions — layout already called getMyPermissions(orgId),
  // so this is a free cache hit with no DB round trip.
  const permissionKeys = await getMyPermissions(orgId);

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  if (!canViewAll && !canViewTeam) redirect('/broadcasts');

  const canManage = permissionKeys.includes('hr.manage_records');
  const canManagePerformanceCycles = permissionKeys.includes('performance.manage_cycles');

  // Both data fetches in parallel — no prior permission round trips needed.
  const [rows, dashStats] = await Promise.all([
    supabase.rpc('hr_directory_list').then(({ data }) => data ?? []),
    canViewAll
      ? supabase.rpc('hr_dashboard_stats').then(({ data }) => data ?? null)
      : Promise.resolve(null),
  ]);

  const params = (await searchParams) ?? {};
  const qRaw = params.q;
  const initialQuery = (Array.isArray(qRaw) ? qRaw[0] : qRaw ?? '').trim();

  return (
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
}
