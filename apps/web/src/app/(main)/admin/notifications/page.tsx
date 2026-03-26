import { AdminNotificationDefaultsClient } from '@/components/admin/AdminNotificationDefaultsClient';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgSettings } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function AdminNotificationDefaultsPage() {
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
