import { AdminRolesAndPermissionsView } from '@/components/admin/AdminRolesAndPermissionsView';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminRolesPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: canViewRoles } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'roles.view',
    p_context: {},
  });
  if (!canViewRoles) redirect('/admin');

  const { data: canManageRoles } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'roles.manage',
    p_context: {},
  });

  return <AdminRolesAndPermissionsView canManageRoles={Boolean(canManageRoles)} />;
}
