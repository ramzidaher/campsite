import { cache } from 'react';

import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';

export type ReportsDepartmentOption = { id: string; name: string };

export type CachedReportsPageData =
  | { kind: 'redirect'; to: string }
  | { kind: 'ok'; canManage: boolean; departments: ReportsDepartmentOption[] };

export const getCachedReportsPageData = cache(async (): Promise<CachedReportsPageData> => {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) return { kind: 'redirect', to: '/login' };
  if (shellBundleProfileStatus(bundle) !== 'active') return { kind: 'redirect', to: '/broadcasts' };

  const permissionKeys = parseShellPermissionKeys(bundle);
  const canManage = permissionKeys.includes('reports.manage');
  const canView = canManage || permissionKeys.includes('reports.view');
  if (!canView) return { kind: 'redirect', to: '/dashboard' };

  const supabase = await createClient();
  const { data: deptRows } = await supabase
    .from('departments')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  const departments: ReportsDepartmentOption[] = (deptRows ?? []).map((d) => ({
    id: String(d.id),
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Department',
  }));

  return { kind: 'ok', canManage, departments };
});
