import { AdminRotaView } from '@/components/admin/AdminRotaView';
import { loadAdminRotaDashboard } from '@/lib/admin/loadAdminRota';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminRotaPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const data = await loadAdminRotaDashboard(supabase, profile.org_id as string);

  return <AdminRotaView data={data} />;
}
