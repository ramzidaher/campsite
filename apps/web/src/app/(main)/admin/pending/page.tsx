import { AdminPendingApprovalsClient } from '@/components/admin/AdminPendingApprovalsClient';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function AdminPendingPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin/pending',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, role, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const permissionKeys = await withServerPerf(
    '/admin/pending',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  );
  const canReviewApprovals = permissionKeys.includes('approvals.members.review');
  const canBulkApprove     = permissionKeys.includes('members.edit_status');
  if (!canReviewApprovals) redirect('/forbidden');

  const orgId = profile.org_id as string;
  const rows = await withServerPerf(
    '/admin/pending',
    'load_pending_approval_rows',
    loadPendingApprovalRows(supabase, user.id, orgId, profile.role as string),
    500
  );

  const view = (
    <AdminPendingApprovalsClient
      initialRows={rows}
      orgId={orgId}
      showApproveAll={Boolean(canBulkApprove)}
      viewerRole={profile.role as string}
    />
  );
  warnIfSlowServerPath('/admin/pending', pathStartedAtMs);
  return view;
}
