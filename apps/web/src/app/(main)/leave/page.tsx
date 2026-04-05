import { LeaveHubClient } from '@/components/leave/LeaveHubClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LeavePage() {
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

  const orgId = profile.org_id as string;

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
  const keys = ((perms ?? []) as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''));

  const canView =
    keys.includes('leave.view_own') ||
    keys.includes('leave.approve_direct_reports') ||
    keys.includes('leave.manage_org');
  if (!canView) redirect('/broadcasts');

  const canSubmit = keys.includes('leave.submit');
  const canApprove = keys.includes('leave.approve_direct_reports') || keys.includes('leave.manage_org');
  const canManage = keys.includes('leave.manage_org');

  const initialYear = String(new Date().getFullYear());

  return (
    <LeaveHubClient
      orgId={orgId}
      userId={user.id}
      canSubmit={canSubmit}
      canApprove={canApprove}
      canManage={canManage}
      initialYear={initialYear}
    />
  );
}
