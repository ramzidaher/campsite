import { HrOneOnOneComplianceClient } from '@/components/one-on-one/HrOneOnOneComplianceClient';
import { getCachedHrOneOnOneCompliancePageData } from '@/lib/hr/getCachedHrOneOnOneCompliancePageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function HrOneOnOnesPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/one-on-ones',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('hr.view_records')) redirect('/broadcasts');

  const pageData = await withServerPerf(
    '/admin/hr/one-on-ones',
    'cached_hr_one_on_one_compliance_page_data',
    getCachedHrOneOnOneCompliancePageData(orgId, 'all'),
    650
  );
  if (pageData.errorMessage) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[#b91c1c]">{pageData.errorMessage}</p>
      </div>
    );
  }

  const view = <HrOneOnOneComplianceClient initialRows={pageData.rows} />;
  warnIfSlowServerPath('/admin/hr/one-on-ones', pathStartedAtMs);
  return view;
}
