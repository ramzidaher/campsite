import { HrMetricNotificationsClient } from '@/components/hr/HrMetricNotificationsClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

/** In-app list for hr_metric_notifications (managers + HR). No extra permission gate  RLS returns only your rows. */
export default async function HrMetricNotificationsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: notifications } = await supabase.rpc('hr_metric_notifications_for_me');

  return (
    <HrMetricNotificationsClient
      notifications={(notifications ?? []) as Parameters<typeof HrMetricNotificationsClient>[0]['notifications']}
    />
  );
}
