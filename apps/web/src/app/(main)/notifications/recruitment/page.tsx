import { RecruitmentNotificationsClient } from '@/components/recruitment/RecruitmentNotificationsClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function RecruitmentNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const { data: notifications } = await supabase.rpc('recruitment_notifications_for_me');

  return (
    <RecruitmentNotificationsClient
      notifications={(notifications ?? []) as Parameters<typeof RecruitmentNotificationsClient>[0]['notifications']}
    />
  );
}
