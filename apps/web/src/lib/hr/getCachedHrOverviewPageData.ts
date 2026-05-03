import { cache } from 'react';

import { getMainShellHrNavItemsByPermissions } from '@/lib/adminGates';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';

export type CachedHrOverviewPageData =
  | { kind: 'redirect'; to: string }
  | {
      kind: 'ok';
      permissionKeys: ReturnType<typeof parseShellPermissionKeys>;
      badges: ReturnType<typeof parseShellBadgeCounts>;
    };

export const getCachedHrOverviewPageData = cache(async (): Promise<CachedHrOverviewPageData> => {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) return { kind: 'redirect', to: '/login' };
  if (shellBundleProfileStatus(bundle) !== 'active') return { kind: 'redirect', to: '/broadcasts' };

  const permissionKeys = parseShellPermissionKeys(bundle);
  const timesheetClockEnabled = bundle['timesheet_clock_enabled'] === true;
  if (!getMainShellHrNavItemsByPermissions(permissionKeys, { timesheetClockEnabled })?.length) {
    return { kind: 'redirect', to: '/broadcasts' };
  }

  return {
    kind: 'ok',
    permissionKeys,
    badges: parseShellBadgeCounts(bundle),
  };
});
