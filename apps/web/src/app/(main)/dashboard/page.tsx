import { DashboardHome } from '@/components/dashboard/DashboardHome';
import { loadDashboardHomeGuarded } from '@/lib/dashboard/loadDashboardHome';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import {
  broadcastUnreadFromShellBundle,
  getCachedMainShellLayoutBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import {
  canComposeBroadcastByPermissions,
  canViewDashboardUnreadBroadcastKpi,
  type PermissionKey,
} from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
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
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const shellBundle = await withServerPerf('/dashboard', 'shell_bundle_cached', getCachedMainShellLayoutBundle(), 1500);
  const shellOrgId = typeof shellBundle.org_id === 'string' ? shellBundle.org_id : null;
  const shellRole = typeof shellBundle.profile_role === 'string' ? shellBundle.profile_role : null;
  const shellFullName = typeof shellBundle.profile_full_name === 'string' ? shellBundle.profile_full_name : null;
  const shellHasProfile = shellBundle.has_profile === true;

  let orgId = shellOrgId;
  let role = shellRole;
  let fullName = shellFullName;

  if (!orgId || !role || !shellHasProfile) {
    const { data: profile, error: profileError } = await withServerPerf(
      '/dashboard',
      'profile_lookup',
      supabase
        .from('profiles')
        .select('id, org_id, role, full_name, status')
        .eq('id', user.id)
        .maybeSingle(),
      1500
    );

    if (profileError || !profile?.org_id) {
      if (await isPlatformFounder(supabase, user.id)) {
        redirect('/founders');
      }
      redirect('/login');
    }
    if (profile.status !== 'active') redirect('/pending');

    orgId = profile.org_id as string;
    role = profile.role as string;
    fullName = profile.full_name as string | null;
  }

  const shellPermissionKeys: PermissionKey[] = Array.isArray(shellBundle.permission_keys)
    ? (shellBundle.permission_keys.map((k) => String(k)) as PermissionKey[])
    : [];
  // #region agent log
  fetch('http://127.0.0.1:7879/ingest/38107b8d-e094-4a22-bf69-bb908cf9d00f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1d19'},body:JSON.stringify({sessionId:'4c1d19',runId:'run1',hypothesisId:'H4',location:'dashboard/page.tsx:shellBundle',message:'Shell bundle permission keys observed',data:{shellPermissionCount:shellPermissionKeys.length,hasOrgId:Boolean(shellBundle.org_id)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const permissionKeys =
    shellPermissionKeys.length > 0
      ? shellPermissionKeys
      : await withServerPerf(
          '/dashboard',
          'get_my_permissions',
          getMyPermissions(orgId as string),
          1500
        );
  // #region agent log
  fetch('http://127.0.0.1:7879/ingest/38107b8d-e094-4a22-bf69-bb908cf9d00f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4c1d19'},body:JSON.stringify({sessionId:'4c1d19',runId:'run1',hypothesisId:'H4',location:'dashboard/page.tsx:permissionSource',message:'Dashboard permission source resolved',data:{usedShellPermissions:shellPermissionKeys.length>0,permissionCount:permissionKeys.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
    loadDashboardHomeGuarded(
      supabase,
      user.id,
      orgId as string,
      {
        full_name: fullName ?? null,
        role,
      },
      { initialBroadcastUnread, initialPendingApprovals, manualRefresh }
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
