import { CalendarNotificationsClient } from '@/components/calendar/CalendarNotificationsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function CalendarNotificationsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: notifications } = await supabase.rpc('calendar_event_notifications_for_me');

  return (
    <CalendarNotificationsClient
      notifications={(notifications ?? []) as Parameters<typeof CalendarNotificationsClient>[0]['notifications']}
    />
  );
}
