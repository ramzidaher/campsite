import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { HiringApplicationFormsTableClient } from '@/components/admin/HiringApplicationFormsTableClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getCachedHiringApplicationFormsPageData } from '@/lib/recruitment/getCachedHiringApplicationFormsPageData';
import { redirect } from 'next/navigation';

export default async function HiringApplicationFormsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canViewJobs = permissionKeys.includes('jobs.view');
  const canViewApplications = permissionKeys.includes('applications.view');
  if (!canViewJobs && !canViewApplications) redirect('/forbidden');

  const pageData = await getCachedHiringApplicationFormsPageData(orgId);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <HideInHiringHub>
        <div className="mb-5">
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Application forms</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Reusable forms you can attach to any role before making a job advert live.
          </p>
        </div>
      </HideInHiringHub>

      <HiringApplicationFormsTableClient rows={pageData.rows} />
    </div>
  );
}
