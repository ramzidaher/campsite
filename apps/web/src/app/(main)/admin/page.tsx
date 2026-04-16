import { AdminOrgBulkApprove } from '@/components/admin/AdminOrgBulkApprove';
import { AdminOverviewView } from '@/components/admin/AdminOverviewView';
import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { loadPendingApprovalsPreview } from '@/lib/dashboard/loadDashboardHome';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import type { PermissionKey } from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function AdminHomePage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/admin',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('id, org_id, role, full_name, status')
      .eq('id', user.id)
      .single(),
    300
  );

  if (!profile?.org_id) redirect('/broadcasts');
  if (profile.status !== 'active') redirect('/pending');

  const permissionKeys = await withServerPerf(
    '/admin',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  );
  const data = await withServerPerf(
    '/admin',
    'load_admin_overview',
    loadAdminOverview(supabase, profile.org_id as string, {
      role: profile.role as string,
      full_name: profile.full_name as string | null,
      permissions: permissionKeys as PermissionKey[],
    }),
    500
  );

  const showQuickApprove = permissionKeys.includes('members.edit_status' as PermissionKey);
  const pendingPreview = showQuickApprove && data.pendingCount > 0
    ? (
        await withServerPerf(
          '/admin',
          'pending_approvals_preview',
          loadPendingApprovalsPreview(
            supabase,
            user.id,
            profile.org_id as string,
            profile.role as string
          ),
          450
        )
      ).slice(0, 8)
    : [];

  const view = (
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
  warnIfSlowServerPath('/admin', pathStartedAtMs);
  return view;
}
