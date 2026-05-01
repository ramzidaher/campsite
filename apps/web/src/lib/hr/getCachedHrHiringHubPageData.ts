import { cache } from 'react';

import { parseShellPermissionKeys } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';

export type CachedHrHiringHubPageData = {
  redirectTo: string;
};

export const getCachedHrHiringHubPageData = cache(async (): Promise<CachedHrHiringHubPageData> => {
  const bundle = await getCachedMainShellLayoutBundle();
  const permissionKeys = parseShellPermissionKeys(bundle);

  if (
    permissionKeys.includes('recruitment.view') ||
    permissionKeys.includes('recruitment.manage') ||
    permissionKeys.includes('recruitment.approve_request') ||
    permissionKeys.includes('recruitment.create_request')
  ) {
    return { redirectTo: '/hr/hiring/requests' };
  }
  if (permissionKeys.includes('jobs.view')) return { redirectTo: '/hr/hiring/jobs' };
  if (permissionKeys.includes('applications.view')) return { redirectTo: '/hr/hiring/applications' };
  if (permissionKeys.includes('interviews.view') || permissionKeys.includes('interviews.book_slot')) {
    return { redirectTo: '/hr/hiring/interviews' };
  }
  if (permissionKeys.includes('offers.view')) return { redirectTo: '/hr/hiring/templates' };

  return { redirectTo: '/hr' };
});
