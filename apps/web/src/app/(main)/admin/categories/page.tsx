import { AdminCategoriesClient } from '@/components/admin/AdminCategoriesClient';
import { getCachedAdminCategoriesPageData } from '@/lib/admin/getCachedAdminCategoriesPageData';
import { hasPermission } from '@/lib/adminGates';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminCategoriesPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!hasPermission(permissionKeys, 'departments.view')) redirect('/admin');

  const pageData = await getCachedAdminCategoriesPageData(orgId);

  return (
    <AdminCategoriesClient
      initialDepartments={pageData.departments}
      categoriesByDept={pageData.categoriesByDept}
    />
  );
}
