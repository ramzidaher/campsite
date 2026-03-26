import { AdminRotaView } from '@/components/admin/AdminRotaView';
import { loadAdminRotaDashboard } from '@/lib/admin/loadAdminRota';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminRotaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, role')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const data = await loadAdminRotaDashboard(supabase, profile.org_id as string);

  return <AdminRotaView data={data} viewerRole={profile.role as string} />;
}
