import { AdminUsersClient } from '@/components/admin/AdminUsersClient';
import { getCachedAdminUsersPageData, type AdminUsersSearchParams } from '@/lib/admin/getCachedAdminUsersPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<AdminUsersSearchParams>;
}) {
  const pathStartedAtMs = Date.now();
  const sp = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const bundle = await withServerPerf('/admin/users', 'shell_bundle_for_access', getCachedMainShellLayoutBundle(), 300);
  const orgId = shellBundleOrgId(bundle);
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');

  let payload: Awaited<ReturnType<typeof getCachedAdminUsersPageData>>;
  try {
    payload = await withServerPerf(
      '/admin/users',
      'cached_admin_users_page_data',
      getCachedAdminUsersPageData(
      user.id,
        orgId,
        permissionKeys,
        sp
      ),
      700
    );
  } catch (err) {
    return <p className="text-sm text-red-300">{err instanceof Error ? err.message : 'Failed to load members'}</p>;
  }
  if (!payload) redirect('/admin');

  const view = (
    <AdminUsersClient
      currentUserId={user.id}
      canEditRoles={payload.canEditRoles}
      canDeleteUsers={payload.canDeleteUsers}
      assignableRoles={payload.assignableRoles}
      roleFilterOptions={payload.roleFilterOptions}
      managerChoices={payload.managerChoices}
      initialRows={payload.initialRows}
      departments={payload.departments}
      defaultFilters={payload.defaultFilters}
      orgName={payload.orgName}
      totalMemberCount={payload.totalMemberCount}
      canOpenHrFile={payload.canOpenHrFile}
    />
  );
  warnIfSlowServerPath('/admin/users', pathStartedAtMs);
  return view;
}
