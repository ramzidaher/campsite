import { OneOnOnesHubClient, type OneOnOneMeetingRow } from '@/components/one-on-one/OneOnOnesHubClient';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function OneOnOnesPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const permissionKeys = await getMyPermissions(orgId);
  const canView   = permissionKeys.includes('one_on_one.view_own');
  const canHr     = permissionKeys.includes('hr.view_records');
  if (!canView && !canHr) redirect('/forbidden');

  const canManage = permissionKeys.includes('one_on_one.manage_direct_reports');

  const { data: meetingsRaw, error } = await supabase.rpc('one_on_one_meeting_list', {
    p_limit: 80,
    p_include_cancelled: false,
  });
  if (error) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[#b91c1c]">{error.message}</p>
      </div>
    );
  }

  const meetings = (Array.isArray(meetingsRaw) ? meetingsRaw : []) as OneOnOneMeetingRow[];

  const { data: reports } = canManage
    ? await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('org_id', orgId)
        .eq('reports_to_user_id', user.id)
        .eq('status', 'active')
    : { data: [] };

  return (
    <OneOnOnesHubClient
      userId={user.id}
      orgId={orgId}
      initialMeetings={meetings}
      canManage={!!canManage}
      directReports={(reports ?? []).map((r) => ({ id: r.id as string, full_name: r.full_name as string }))}
    />
  );
}
