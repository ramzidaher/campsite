import { AdminOrgBulkApprove } from '@/components/admin/AdminOrgBulkApprove';
import { AdminOverviewView } from '@/components/admin/AdminOverviewView';
import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { loadPendingApprovalsPreview } from '@/lib/dashboard/loadDashboardHome';
import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminHomePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/broadcasts');
  if (profile.status !== 'active') redirect('/pending');

  const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const permissionKeys = ((perms ?? []) as Array<{ permission_key?: string }>).map(
    (p) => String(p.permission_key ?? '') as PermissionKey
  );
  const data = await loadAdminOverview(supabase, profile.org_id as string, {
    role: profile.role as string,
    full_name: profile.full_name as string | null,
    permissions: permissionKeys,
  });

  const { data: canBulkApprove } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'members.edit_status',
    p_context: {},
  });
  const showQuickApprove = Boolean(canBulkApprove);
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
