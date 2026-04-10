import { ApplicationNotificationsClient } from '@/components/recruitment/ApplicationNotificationsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function ApplicationNotificationsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const [{ data: notifications }, { data: canManageApplications }] = await Promise.all([
    supabase.rpc('application_notifications_for_me'),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'applications.manage',
      p_context: {},
    }),
  ]);

  return (
    <ApplicationNotificationsClient
      notifications={(notifications ?? []) as Parameters<typeof ApplicationNotificationsClient>[0]['notifications']}
      applicationsBasePath={canManageApplications ? '/admin/jobs' : '/hr/jobs'}
    />
  );
}
