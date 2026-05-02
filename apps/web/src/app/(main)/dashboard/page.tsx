import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { getCachedDashboardHomePageData } from '@/lib/dashboard/getCachedDashboardHomePageData';
import {
  broadcastUnreadFromShellBundle,
  getCachedMainShellLayoutBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import {
  canComposeBroadcastByPermissions,
  canViewDashboardUnreadBroadcastKpi,
  type PermissionKey,
} from '@campsite/types';
import { redirect } from 'next/navigation';
import { warnIfSlowServerPathWithThreshold, withServerPerf } from '@/lib/perf/serverPerf';
import { headers } from 'next/headers';

function greeting(hour: number, name: string) {
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default async function DashboardPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const shellBundle = await withServerPerf('/dashboard', 'shell_bundle_cached', getCachedMainShellLayoutBundle(), 1500);
  const shellOrgId = shellBundleOrgId(shellBundle);
  let userId = typeof shellBundle.user_id === 'string' ? shellBundle.user_id : null;
  const shellRole = typeof shellBundle.profile_role === 'string' ? shellBundle.profile_role : null;
  const shellFullName = typeof shellBundle.profile_full_name === 'string' ? shellBundle.profile_full_name : null;
  if (!userId && shellOrgId) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    userId = authData.user?.id ?? null;
    void authError;
  }
  if (!userId || !shellOrgId) {
    redirect('/login');
  }
  const status = shellBundleProfileStatus(shellBundle);
  if (status === 'pending') redirect('/pending');
  if (status && status !== 'active') redirect('/broadcasts');
  const orgId = shellOrgId;
  // Keep dashboard fail-open when shell role is temporarily absent.
  const role = shellRole ?? 'member';
  const fullName = shellFullName;

  const shellPermissionKeys = parseShellPermissionKeys(shellBundle) as PermissionKey[];
  const permissionKeys = shellPermissionKeys;
  const initialBroadcastUnread = canViewDashboardUnreadBroadcastKpi(role)
    ? broadcastUnreadFromShellBundle(shellBundle)
    : undefined;
  const initialPendingApprovalsRaw = shellBundle['pending_approvals'];
  const initialPendingApprovals =
    initialPendingApprovalsRaw !== null && initialPendingApprovalsRaw !== undefined
      ? Number(initialPendingApprovalsRaw)
      : undefined;

  const reqHeaders = await headers();
  const cacheControl = reqHeaders.get('cache-control') ?? '';
  const pragma = reqHeaders.get('pragma') ?? '';
  const manualRefresh =
    /no-cache|max-age=0/i.test(cacheControl) || /no-cache/i.test(pragma);

  const data = await withServerPerf(
    '/dashboard',
    'load_dashboard_home',
    getCachedDashboardHomePageData(
      userId,
      orgId,
      fullName ?? null,
      role,
      initialBroadcastUnread,
      initialPendingApprovals,
      manualRefresh
    ),
    5000
  );

  const hour = new Date().getHours();
  const greetingLine = `${greeting(hour, data.userName)} 👋`;

  const canViewOrgDirectory = permissionKeys.includes('members.view');
  const canCompose = canComposeBroadcastByPermissions(permissionKeys);
  const showPrimaryComposeCta = canCompose && permissionKeys.includes('broadcasts.publish_without_approval');

  const view = (
    <DashboardHome
      data={data}
      greetingLine={greetingLine}
      canCompose={canCompose}
      showPrimaryComposeCta={showPrimaryComposeCta}
      membersStatHref={canViewOrgDirectory ? '/admin/users' : null}
    />
  );
  warnIfSlowServerPathWithThreshold('/dashboard', pathStartedAtMs, 7000);
  return view;
}
