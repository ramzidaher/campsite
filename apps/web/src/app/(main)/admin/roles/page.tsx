import { AdminRolesAndPermissionsView } from '@/components/admin/AdminRolesAndPermissionsView';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminRolesPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/roles',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const permissionKeys = await withServerPerf(
    '/admin/roles',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  );
  if (!permissionKeys.includes('roles.view')) redirect('/forbidden');
  const canManageRoles = permissionKeys.includes('roles.manage');

  const view = <AdminRolesAndPermissionsView canManageRoles={Boolean(canManageRoles)} />;
  warnIfSlowServerPath('/admin/roles', pathStartedAtMs);
  return view;
}
