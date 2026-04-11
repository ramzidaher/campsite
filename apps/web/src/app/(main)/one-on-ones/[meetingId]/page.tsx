import {
  OneOnOneMeetingDetailClient,
  type EditRequestRow,
  type MeetingDetail,
} from '@/components/one-on-one/OneOnOneMeetingDetailClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function OneOnOneMeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
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

  const [{ data: canView }, { data: canHrPeek }] = await Promise.all([
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
  if (!canView && !canHrPeek) redirect('/broadcasts');

  const { data: meetingRaw, error: mErr } = await supabase.rpc('one_on_one_meeting_get', {
    p_meeting_id: meetingId,
  });
  if (mErr || !meetingRaw || typeof meetingRaw !== 'object') {
    redirect('/one-on-ones');
  }

  const meeting = meetingRaw as unknown as MeetingDetail;

  const { data: reqRaw } = await supabase.rpc('one_on_one_note_edit_requests_for_meeting', {
    p_meeting_id: meetingId,
  });
  const editRequests = (Array.isArray(reqRaw) ? reqRaw : []) as EditRequestRow[];

  const isManager = meeting.manager_user_id === user.id;

  const { data: canHr } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'hr.manage_records',
    p_context: {},
  });

  return (
    <OneOnOneMeetingDetailClient
      userId={user.id}
      meeting={meeting}
      editRequests={editRequests}
      isManager={isManager}
      canHrResolve={!!canHr}
    />
  );
}
