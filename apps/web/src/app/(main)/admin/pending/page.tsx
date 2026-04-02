import { AdminPendingApprovalsClient } from '@/components/admin/AdminPendingApprovalsClient';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminPendingPage() {
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
  const [{ data: canReviewApprovals }, { data: canBulkApprove }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'approvals.members.review',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'members.edit_status',
      p_context: {},
    }),
  ]);
  if (!canReviewApprovals) redirect('/admin');

  const orgId = profile.org_id as string;
  const rows = await loadPendingApprovalRows(supabase, user.id, orgId, profile.role as string);

  return (
    <AdminPendingApprovalsClient
      initialRows={rows}
      orgId={orgId}
      showApproveAll={Boolean(canBulkApprove)}
      viewerRole={profile.role as string}
    />
  );
}
