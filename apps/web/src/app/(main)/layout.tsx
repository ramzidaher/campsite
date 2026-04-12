import { AppShell } from '@/components/AppShell';
import type { TopBarNotificationItem } from '@/components/shell/AppTopBar';
import { MainProviders } from '@/components/providers/MainProviders';
import { ThemeRoot } from '@/components/ThemeRoot';
import {
  getMainShellAdminNavItemsByPermissions,
  getMainShellHrNavItemsByPermissions,
  getMainShellManagerNavItemsByPermissions,
  getMainShellManagerNavSectionLabel,
} from '@/lib/adminGates';
import { createClient } from '@/lib/supabase/server';
import {
  type PermissionKey,
} from '@campsite/types';

// Force-dynamic is required: layout data is fully user-specific (permissions, badge counts).
export const dynamic = 'force-dynamic';

function roleLabel(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'Org admin',
    super_admin: 'Org admin',
    manager: 'Manager',
    coordinator: 'Coordinator',
    administrator: 'Administrator',
    duty_manager: 'Duty manager',
    csa: 'CSA',
    society_leader: 'Society leader',
    unassigned: 'Pending role',
  };
  return m[role] ?? role;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Single round trip to Supabase — replaces the previous 3 sequential Promise.all
  // batches that each depended on the prior batch's results (profile → org/permissions
  // → badge counts). On Vercel → Frankfurt Supabase (~150 ms/round trip) the old
  // waterfall added 450 ms+ of pure network latency per page load.
  const { data: bundle } = await supabase.rpc('main_shell_layout_bundle');
  const b = (bundle && typeof bundle === 'object' ? bundle : {}) as Record<string, unknown>;

  const num = (k: string): number => {
    const v = b[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
    if (v !== null && v !== undefined) return Math.max(0, Number(v));
    return 0;
  };
  const str = (k: string): string | null =>
    typeof b[k] === 'string' ? (b[k] as string) : null;

  const hasProfile     = Boolean(b['has_profile']);
  const emailLocal     = str('email')?.split('@')[0]?.trim() ?? '';
  const profileRole    = str('profile_role')?.trim() || null;
  const currentOrgId   = str('org_id');

  const hasTenantProfile = hasProfile;
  const orgName          = str('org_name') ?? 'Organisation';
  const orgLogoUrl       = str('org_logo_url');
  const userAvatarUrl    = str('profile_avatar_url');
  const userRoleLabel    = profileRole ? roleLabel(profileRole) : '';
  const deptLine         = str('dept_name');

  const userName = hasProfile
    ? str('profile_full_name')?.trim() || emailLocal || 'Account'
    : emailLocal || 'Finish setup';

  // Badge counts
  const unreadBroadcasts              = num('broadcast_unread');
  const pendingApprovalCount          = num('pending_approvals');
  const pendingBroadcastApprovals     = num('broadcast_pending_approvals');
  const rotaPendingFinalCount         = num('rota_pending_final');
  const rotaPendingPeerCount          = num('rota_pending_peer');
  const recruitmentPendingReviewCount = num('recruitment_pending_review');
  const recruitmentUnreadNotifications = num('recruitment_notifications');
  const applicationUnreadNotifications = num('application_notifications');
  const leaveUnreadNotifications       = num('leave_notifications');
  const hrMetricUnreadNotifications    = num('hr_metric_notifications');
  const leaveNavBadge                  = num('leave_pending_approval');
  const performanceNavBadge            = num('performance_pending');
  const showOnboardingNav              = num('onboarding_active') > 0;

  // Permissions
  const rawPerms = b['permission_keys'];
  const permissionKeys: PermissionKey[] = Array.isArray(rawPerms)
    ? (rawPerms.map(String) as PermissionKey[])
    : [];

  // Nav visibility derived from permissions (no extra round trips)
  const showLeaveNav =
    permissionKeys.includes('leave.view_own') ||
    permissionKeys.includes('leave.approve_direct_reports') ||
    permissionKeys.includes('leave.manage_org');
  const showMyHrRecordNav = permissionKeys.includes('hr.view_own');
  const showOneOnOneNav =
    permissionKeys.includes('one_on_one.view_own') || permissionKeys.includes('hr.view_records');
  const showMemberSearch =
    permissionKeys.includes('hr.view_records') || permissionKeys.includes('hr.view_direct_reports');
  const hasAdminAreaAccess = permissionKeys.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.')
  );
  const canApproveRecruitment = permissionKeys.includes('recruitment.approve_request');
  const showPerformanceNav    = permissionKeys.includes('performance.review_direct_reports');

  const managerNavItems = getMainShellManagerNavItemsByPermissions(permissionKeys, {
    pendingApprovalCount,
    pendingBroadcastApprovals,
  });

  const adminNavItemsRaw = getMainShellAdminNavItemsByPermissions(permissionKeys);
  const hrNavItemsRaw    = getMainShellHrNavItemsByPermissions(permissionKeys);

  const mapHrBadges = <T extends { href: string }>(items: T[] | null) =>
    items?.map((item) => {
      if (item.href === '/admin/pending' && pendingApprovalCount > 0) {
        return { ...item, badge: pendingApprovalCount };
      }
      if (item.href === '/hr/recruitment' && recruitmentPendingReviewCount > 0) {
        return { ...item, badge: recruitmentPendingReviewCount };
      }
      return item;
    }) ?? null;

  const adminNavItems = mapHrBadges(adminNavItemsRaw);
  const hrNavItems    = mapHrBadges(hrNavItemsRaw);

  const showStandaloneApprovals =
    permissionKeys.includes('approvals.members.review') && !hasAdminAreaAccess && !managerNavItems;

  const topBarNotifications: TopBarNotificationItem[] = [
    {
      id: 'broadcast-unread',
      label: 'Unread broadcasts',
      href: '/broadcasts',
      count: unreadBroadcasts,
    },
    {
      id: 'broadcast-pending',
      label: 'Broadcast approvals',
      href: '/broadcasts?tab=pending',
      count: pendingBroadcastApprovals,
    },
    {
      id: 'profile-pending',
      label: 'Pending member approvals',
      href: hasAdminAreaAccess ? '/admin/pending' : '/pending-approvals',
      count: pendingApprovalCount,
    },
    {
      id: 'rota-peer',
      label: 'Rota swaps awaiting your OK',
      href: '/rota',
      count: rotaPendingPeerCount,
    },
    {
      id: 'rota-final',
      label: 'Rota requests awaiting approval',
      href: '/rota',
      count: rotaPendingFinalCount,
    },
    {
      id: 'recruitment-pending',
      label: 'Recruitment requests to review',
      href: '/hr/recruitment',
      count: canApproveRecruitment ? recruitmentPendingReviewCount : 0,
    },
    {
      id: 'leave-pending',
      label: 'Leave requests to approve',
      href: '/leave',
      count: leaveNavBadge,
    },
    {
      id: 'recruitment-notifications',
      label: 'Recruitment updates',
      href: '/notifications/recruitment',
      count: recruitmentUnreadNotifications,
    },
    {
      id: 'application-notifications',
      label: 'Application updates',
      href: '/notifications/applications',
      count: applicationUnreadNotifications,
    },
    {
      id: 'leave-notifications',
      label: 'Time off updates',
      href: '/notifications/leave',
      count: leaveUnreadNotifications,
    },
    {
      id: 'hr-metric-notifications',
      label: 'HR metric alerts',
      href: '/notifications/hr-metrics',
      count: hrMetricUnreadNotifications,
    },
  ].filter((item) => item.count > 0);

  return (
    <ThemeRoot>
      <MainProviders>
        <AppShell
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          userRoleLabel={userRoleLabel}
          hasTenantProfile={hasTenantProfile}
          deptLine={deptLine}
          profileRole={profileRole}
          unreadBroadcasts={unreadBroadcasts}
          pendingBroadcastApprovals={pendingBroadcastApprovals}
          pendingApprovalCount={pendingApprovalCount}
          rotaPendingFinalCount={rotaPendingFinalCount}
          rotaPendingPeerCount={rotaPendingPeerCount}
          recruitmentPendingReviewCount={recruitmentPendingReviewCount}
          topBarNotifications={topBarNotifications}
          managerNavItems={managerNavItems}
          managerNavSectionLabel={
            managerNavItems && profileRole ? getMainShellManagerNavSectionLabel(profileRole) : 'Manager'
          }
          hrNavItems={hrNavItems}
          adminNavItems={adminNavItems}
          showStandaloneApprovals={showStandaloneApprovals}
          showLeaveNav={showLeaveNav}
          leaveNavBadge={leaveNavBadge}
          showPerformanceNav={showPerformanceNav}
          performanceNavBadge={performanceNavBadge}
          showOnboardingNav={showOnboardingNav}
          showOneOnOneNav={showOneOnOneNav}
          showMyHrRecordNav={showMyHrRecordNav}
          showMemberSearch={showMemberSearch}
          orgId={currentOrgId}
        >
          {children}
        </AppShell>
      </MainProviders>
    </ThemeRoot>
  );
}
