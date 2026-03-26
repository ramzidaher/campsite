import { AdminIntegrationsView } from '@/components/admin/AdminIntegrationsView';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgSettings } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function AdminIntegrationsPage() {
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
  if (!canManageOrgSettings(profile.role)) redirect('/admin');

  const { count } = await supabase
    .from('sheets_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id);

  return <AdminIntegrationsView sheetsMappingCount={count ?? 0} />;
}
