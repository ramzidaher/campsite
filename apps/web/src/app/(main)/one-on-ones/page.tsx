import { OneOnOnesHubClient, type OneOnOneMeetingRow } from '@/components/one-on-one/OneOnOnesHubClient';
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

  const [{ data: canView }, { data: canHr }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'one_on_one.view_own',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_records',
      p_context: {},
    }),
  ]);
  if (!canView && !canHr) redirect('/broadcasts');

  const { data: canManage } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'one_on_one.manage_direct_reports',
    p_context: {},
  });

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
