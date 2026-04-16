import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { loadDashboardHome } from '@/lib/dashboard/loadDashboardHome';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import {
  broadcastUnreadFromShellBundle,
  getCachedMainShellLayoutBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import { canComposeBroadcastByPermissions, canViewDashboardUnreadBroadcastKpi } from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

function greeting(hour: number, name: string) {
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}

export default async function DashboardPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await withServerPerf(
    '/dashboard',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('id, org_id, role, full_name, status')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );

  if (profileError || !profile?.org_id) {
    if (await isPlatformFounder(supabase, user.id)) {
      redirect('/founders');
    }
    redirect('/login');
  }
  if (profile.status !== 'active') redirect('/pending');

  // Cache hit — layout already called getMyPermissions for nav display.
  const permissionKeys = await withServerPerf(
    '/dashboard',
    'get_my_permissions',
    getMyPermissions(profile.org_id as string),
    300
  );

  const shellBundle = await withServerPerf('/dashboard', 'shell_bundle_cached', getCachedMainShellLayoutBundle(), 350);
  const role = profile.role as string;
  const initialBroadcastUnread = canViewDashboardUnreadBroadcastKpi(role)
    ? broadcastUnreadFromShellBundle(shellBundle)
    : undefined;
  const initialPendingApprovalsRaw = shellBundle['pending_approvals'];
  const initialPendingApprovals =
    initialPendingApprovalsRaw !== null && initialPendingApprovalsRaw !== undefined
      ? Number(initialPendingApprovalsRaw)
      : undefined;

  const data = await withServerPerf(
    '/dashboard',
    'load_dashboard_home',
    loadDashboardHome(
      supabase,
      user.id,
      profile.org_id as string,
      {
        full_name: profile.full_name as string | null,
        role,
      },
      { initialBroadcastUnread, initialPendingApprovals }
    ),
    500
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
  warnIfSlowServerPath('/dashboard', pathStartedAtMs);
  return view;
}
