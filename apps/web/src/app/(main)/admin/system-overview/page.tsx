import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminSystemOverviewPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/system-overview',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status, role, full_name')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const permissionKeys = (await withServerPerf(
    '/admin/system-overview',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  )) as PermissionKey[];

  const hasGraphAccess = permissionKeys.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('approvals.') ||
      k.startsWith('departments.') ||
      k.startsWith('teams.') ||
      k.startsWith('broadcasts.') ||
      k.startsWith('discounts.') ||
      k.startsWith('rota.') ||
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.')
  );
  if (!hasGraphAccess) redirect('/admin');

  const [bundle, adminOverview] = await Promise.all([
    withServerPerf(
      '/admin/system-overview',
      'load_departments_directory',
      loadDepartmentsDirectory(supabase, profile.org_id as string, null),
      500
    ),
    withServerPerf(
      '/admin/system-overview',
      'load_admin_overview',
      loadAdminOverview(supabase, profile.org_id as string, {
        role: String(profile.role ?? ''),
        full_name: (profile.full_name as string | null) ?? null,
        permissions: permissionKeys,
      }),
      500
    ),
  ]);

  const graph = buildSystemOverviewGraph({
    permissions: permissionKeys,
    bundle,
    adminOverview,
    isManagerScoped: false,
  });

  const view = (
    <SystemOverviewGraphClient
      title="System overview"
      subtitle="Permission-scoped connected map of modules, entities, and operations."
      nodes={graph.nodes}
      edges={graph.edges}
    />
  );
  warnIfSlowServerPath('/admin/system-overview', pathStartedAtMs);
  return view;
}

