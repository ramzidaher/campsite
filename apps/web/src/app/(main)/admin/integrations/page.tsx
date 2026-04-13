import { AdminIntegrationsView } from '@/components/admin/AdminIntegrationsView';
import { createClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/adminGates';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminIntegrationsPage() {
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
  if (!hasPermission(permissionKeys, 'integrations.manage')) redirect('/admin');

  const { count } = await supabase
    .from('sheets_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id);

  return <AdminIntegrationsView sheetsMappingCount={count ?? 0} />;
}
