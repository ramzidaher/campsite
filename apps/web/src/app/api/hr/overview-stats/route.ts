import { getCachedHrOverviewStats } from '@/lib/hr/getCachedHrOverviewStats';
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
  const includeJobs = permissionKeys.includes('jobs.view');
  const includeApplications = permissionKeys.includes('applications.view');
  const includeMembers = permissionKeys.includes('hr.view_records');
  const includeInterviews = permissionKeys.includes('interviews.view') || permissionKeys.includes('interviews.book_slot');

  try {
    const stats = await getCachedHrOverviewStats(orgId, {
      includeJobs,
      includeApplications,
      includeMembers,
      includeInterviews,
    });
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load HR overview stats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
