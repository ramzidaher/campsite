import { getCachedHrDashboardStats } from '@/lib/hr/getCachedHrDashboardStats';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { NextResponse } from 'next/server';

export async function GET() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (shellBundleProfileStatus(bundle) !== 'active') {
    return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  }

  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('hr.view_records')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  try {
    const stats = await getCachedHrDashboardStats(orgId);
    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load HR dashboard stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
