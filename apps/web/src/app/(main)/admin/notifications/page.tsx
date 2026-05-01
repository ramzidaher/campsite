import { AdminNotificationDefaultsClient } from '@/components/admin/AdminNotificationDefaultsClient';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminNotificationDefaultsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));
  if (!hasPermission(permissionKeys, 'roles.manage')) redirect('/forbidden');

  const { data: org } = await supabase
    .from('organisations')
    .select('id, default_notifications_enabled')
    .eq('id', profile.org_id)
    .single();

  if (!org) redirect('/admin');

  return (
    <AdminNotificationDefaultsClient
      initial={{
        orgId: org.id as string,
        default_notifications_enabled: org.default_notifications_enabled as boolean,
      }}
    />
  );
}
