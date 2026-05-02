import { cache } from 'react';

import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';

export type CachedReportsPageData =
  | { kind: 'redirect'; to: string }
  | { kind: 'ok'; canManage: boolean };

export const getCachedReportsPageData = cache(async (): Promise<CachedReportsPageData> => {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) return { kind: 'redirect', to: '/login' };
  if (shellBundleProfileStatus(bundle) !== 'active') return { kind: 'redirect', to: '/broadcasts' };

  const permissionKeys = parseShellPermissionKeys(bundle);
  const canManage = permissionKeys.includes('reports.manage');
  const canView = canManage || permissionKeys.includes('reports.view');
  if (!canView) return { kind: 'redirect', to: '/dashboard' };

  return { kind: 'ok', canManage };
});
