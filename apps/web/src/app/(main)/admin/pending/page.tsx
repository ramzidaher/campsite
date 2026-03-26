import { AdminPendingApprovalsClient } from '@/components/admin/AdminPendingApprovalsClient';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { canManageOrgUsers } from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import { isApproverRole } from '@campsite/types';
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
  if (!isApproverRole(profile.role)) redirect('/admin');

  const orgId = profile.org_id as string;
  const rows = await loadPendingApprovalRows(supabase, user.id, orgId, profile.role as string);

  return (
    <AdminPendingApprovalsClient
      initialRows={rows}
      orgId={orgId}
      showApproveAll={canManageOrgUsers(profile.role)}
      viewerRole={profile.role as string}
    />
  );
}
