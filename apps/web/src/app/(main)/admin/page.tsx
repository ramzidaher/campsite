import { AdminOrgBulkApprove } from '@/components/admin/AdminOrgBulkApprove';
import { AdminOverviewView } from '@/components/admin/AdminOverviewView';
import { getCachedAdminHomePageData } from '@/lib/admin/getCachedAdminHomePageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import type { PermissionKey } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function AdminHomePage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf('/admin', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/broadcasts');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/pending');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const viewerRoleRaw = (bundle as Record<string, unknown>)['profile_role'];
  const viewerRole = typeof viewerRoleRaw === 'string' ? viewerRoleRaw : '';
  const viewerNameRaw = (bundle as Record<string, unknown>)['profile_full_name'];
  const viewerName = typeof viewerNameRaw === 'string' ? viewerNameRaw : null;
  const viewerUserIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const viewerUserId = typeof viewerUserIdRaw === 'string' ? viewerUserIdRaw : '';
  if (!viewerUserId) redirect('/login');

  const data = await withServerPerf(
    '/admin',
    'cached_admin_home_page_data',
    getCachedAdminHomePageData({
      orgId,
      userId: viewerUserId,
      role: viewerRole,
      fullName: viewerName,
      permissionKeys: permissionKeys as PermissionKey[],
    }),
    700
  );

  const showQuickApprove = permissionKeys.includes('members.edit_status' as PermissionKey);
  const pendingPreview = data.pendingPreview;

  const view = (
    <div className="pb-10">
      <AdminOverviewView data={data.data} />
      {showQuickApprove && data.data.pendingCount > 0 ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-7">
          <AdminOrgBulkApprove
            orgId={orgId}
            pendingCount={data.data.pendingCount}
            pendingPreview={pendingPreview}
          />
        </div>
      ) : null}
    </div>
  );
  warnIfSlowServerPath('/admin', pathStartedAtMs);
  return view;
}
