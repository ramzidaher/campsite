import { AdminOrgBulkApprove } from '@/components/admin/AdminOrgBulkApprove';
import { AdminOverviewView } from '@/components/admin/AdminOverviewView';
import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { loadPendingApprovalsPreview } from '@/lib/dashboard/loadDashboardHome';
import { createClient } from '@/lib/supabase/server';
import { canManageOrgUsers } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/broadcasts');
  if (profile.status !== 'active') redirect('/pending');

  const data = await loadAdminOverview(supabase, profile.org_id as string, {
    role: profile.role as string,
    full_name: profile.full_name as string | null,
  });

  const showQuickApprove = canManageOrgUsers(profile.role);
  const pendingPreview =
    showQuickApprove && data.pendingCount > 0
      ? (await loadPendingApprovalsPreview(
          supabase,
          user.id,
          profile.org_id as string,
          profile.role as string
        )).slice(0, 8)
      : [];

  return (
    <div className="pb-10">
      <AdminOverviewView data={data} />
      {showQuickApprove && data.pendingCount > 0 ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <AdminOrgBulkApprove
            orgId={profile.org_id as string}
            pendingCount={data.pendingCount}
            pendingPreview={pendingPreview}
          />
        </div>
      ) : null}
    </div>
  );
}
