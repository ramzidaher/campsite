import { HrMetricAlertsSettingsClient } from '@/components/hr/HrMetricAlertsSettingsClient';
import { getCachedHrMetricAlertsPageData } from '@/lib/hr/getCachedHrMetricAlertsPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function HrMetricAlertsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('hr.view_records')) redirect('/broadcasts');

  const pageData = await getCachedHrMetricAlertsPageData(orgId);
  if (!pageData) redirect('/broadcasts');
  return <HrMetricAlertsSettingsClient initial={pageData.initial} />;
}
