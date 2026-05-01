import {
  AdminBroadcastsClient,
  type AdminBroadcastRow,
} from '@/components/admin/AdminBroadcastsClient';
import { getCachedAdminBroadcastsPageData } from '@/lib/admin/getCachedAdminBroadcastsPageData';
import { hasPermission } from '@/lib/adminGates';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminBroadcastsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!hasPermission(permissionKeys, 'broadcasts.view')) redirect('/forbidden');

  const pageData = await getCachedAdminBroadcastsPageData(orgId);

  return (
    <AdminBroadcastsClient
      initialRows={pageData.rows as AdminBroadcastRow[]}
      readCountByBroadcast={pageData.readCountByBroadcast}
      departments={pageData.departments}
      categories={pageData.categories}
    />
  );
}
