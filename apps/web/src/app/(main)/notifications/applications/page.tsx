import { ApplicationNotificationsClient } from '@/components/recruitment/ApplicationNotificationsClient';
import { getCachedApplicationNotificationsPageData } from '@/lib/recruitment/getCachedApplicationNotificationsPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function ApplicationNotificationsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const userIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const userId = typeof userIdRaw === 'string' ? userIdRaw : '';
  if (!userId) redirect('/login');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const pageData = await getCachedApplicationNotificationsPageData(orgId, userId);
  const canManageApplications = permissionKeys.includes('applications.manage');

  return (
    <ApplicationNotificationsClient
      notifications={pageData.notifications}
      applicationsBasePath={canManageApplications ? '/admin/jobs' : '/hr/jobs'}
    />
  );
}
