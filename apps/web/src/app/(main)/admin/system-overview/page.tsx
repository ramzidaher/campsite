import { redirect } from 'next/navigation';
import type { PermissionKey } from '@campsite/types';

import { SystemOverviewGraphClient } from '@/components/system/SystemOverviewGraphClient';
import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { createClient } from '@/lib/supabase/server';

export default async function AdminSystemOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = (Array.isArray(perms)
    ? (perms as Array<{ permission_key?: string }>).map((x) => String(x.permission_key ?? ''))
    : []) as PermissionKey[];

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
    loadDepartmentsDirectory(supabase, profile.org_id as string, null),
    loadAdminOverview(supabase, profile.org_id as string, {
      role: String(profile.role ?? ''),
      full_name: (profile.full_name as string | null) ?? null,
      permissions: permissionKeys,
    }),
  ]);

  const graph = buildSystemOverviewGraph({
    permissions: permissionKeys,
    bundle,
    adminOverview,
    isManagerScoped: false,
  });

  return (
    <SystemOverviewGraphClient
      title="System overview"
      subtitle="Permission-scoped connected map of modules, entities, and operations."
      nodes={graph.nodes}
      edges={graph.edges}
    />
  );
}

