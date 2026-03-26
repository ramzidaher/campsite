import { AdminRolesAndPermissionsView } from '@/components/admin/AdminRolesAndPermissionsView';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgUsers } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function AdminRolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!canManageOrgUsers(profile.role)) redirect('/admin');

  return <AdminRolesAndPermissionsView />;
}
