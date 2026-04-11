import { LeaveNotificationsClient } from '@/components/leave/LeaveNotificationsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function LeaveNotificationsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: notifications } = await supabase.rpc('leave_notifications_for_me');

  return (
    <LeaveNotificationsClient
      notifications={(notifications ?? []) as Parameters<typeof LeaveNotificationsClient>[0]['notifications']}
    />
  );
}
