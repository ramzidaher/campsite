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
import { normalizeCelebrationMode } from '@/lib/holidayThemes';
import type { OrgCelebrationModeOverride } from '@/lib/holidayThemes';
import { resolveTenantGovernanceRedirect } from '@/lib/tenantGovernanceGate';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { normalizeUiMode } from '@/lib/uiMode';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { createClient } from '@/lib/supabase/server';
import {
  type PermissionKey,
} from '@campsite/types';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

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
  const pathStartedAtMs = Date.now();
  const headerStore = await headers();
  const pathname = headerStore.get('x-campsite-pathname') ?? '';

  // Two parallel shell RPCs (structural + badge counts), merged to one bundle shape.
  // Cached so child routes (e.g. dashboard) reuse the same result in one request.
  const b = await withServerPerf('/(main)/layout', 'main_shell_layout_bundle_cached', getCachedMainShellLayoutBundle());
  const initialShellBadgeCounts = parseShellBadgeCounts(b);

  const str = (k: string): string | null =>
    typeof b[k] === 'string' ? (b[k] as string) : null;

  const isPlatformOperator = Boolean(b['is_platform_operator']);
  const governanceRedirect = resolveTenantGovernanceRedirect({
    pathname,
    isPlatformOperator,
    hasOrgId: Boolean(str('org_id')),
    orgIsLocked: Boolean(b['org_is_locked']),
    orgMaintenanceMode: Boolean(b['org_maintenance_mode']),
    orgSubscriptionStatus: str('org_subscription_status'),
    orgTrialEndsAtIso: str('org_subscription_trial_ends_at'),
    now: new Date(),
  });
  if (governanceRedirect) {
    redirect(governanceRedirect);
  }

  const num = (k: string): number => {
    const v = b[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
    if (v !== null && v !== undefined) return Math.max(0, Number(v));
    return 0;
  };

  const hasProfile     = Boolean(b['has_profile']);
  const emailLocal     = str('email')?.split('@')[0]?.trim() ?? '';
  const profileRole    = str('profile_role')?.trim() || null;
  const currentOrgId   = str('org_id');
  const initialCelebrationMode = normalizeCelebrationMode(str('celebration_mode'));
  const initialUiMode = normalizeUiMode(str('ui_mode'));
  const initialCelebrationAutoEnabled =
    typeof b['celebration_auto_enabled'] === 'boolean' ? Boolean(b['celebration_auto_enabled']) : true;
  let orgCelebrationOverrides: OrgCelebrationModeOverride[] = [];
  if (currentOrgId) {
    const supabase = await createClient();
    const { data } = await withServerPerf(
      '/(main)/layout',
      'org_celebration_modes',
      supabase
        .from('org_celebration_modes')
        .select(
          'mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
        )
        .eq('org_id', currentOrgId)
        .order('display_order', { ascending: true })
        .order('label', { ascending: true }),
      350
    );
    orgCelebrationOverrides = (data ?? []) as OrgCelebrationModeOverride[];
  }

  const hasTenantProfile = hasProfile;
  const orgName          = str('org_name') ?? 'Organisation';
  const orgLogoUrl       = str('org_logo_url');
  const orgBrandPresetKey = str('org_brand_preset_key');
  const orgBrandPolicy = str('org_brand_policy');
  const rawOrgBrandTokens = b['org_brand_tokens'];
  const orgBrandTokens =
    rawOrgBrandTokens && typeof rawOrgBrandTokens === 'object'
      ? (rawOrgBrandTokens as Record<string, string>)
      : null;
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
  const calendarUnreadNotifications    = num('calendar_event_notifications');
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
    {
      id: 'calendar-notifications',
      label: 'Calendar updates',
      href: '/notifications/calendar',
      count: calendarUnreadNotifications,
    },
  ].filter((item) => item.count > 0);

  const profileReauthRequiredAt = str('profile_reauth_required_at');

  const view = (
    <ThemeRoot>
      <MainProviders
        reauthRequiredAt={profileReauthRequiredAt}
        skipTenantReauth={isPlatformOperator}
      >
        <AppShell
          orgName={orgName}
          orgLogoUrl={orgLogoUrl}
          orgBrandPresetKey={orgBrandPresetKey}
          orgBrandTokens={orgBrandTokens}
          orgBrandPolicy={orgBrandPolicy}
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          userRoleLabel={userRoleLabel}
          hasTenantProfile={hasTenantProfile}
          deptLine={deptLine}
          profileRole={profileRole}
          initialShellBadgeCounts={initialShellBadgeCounts}
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
          initialCelebrationMode={initialCelebrationMode}
          initialUiMode={initialUiMode}
          initialCelebrationAutoEnabled={initialCelebrationAutoEnabled}
          orgCelebrationOverrides={orgCelebrationOverrides}
        >
          {children}
        </AppShell>
      </MainProviders>
    </ThemeRoot>
  );

  warnIfSlowServerPath('/(main)/layout', pathStartedAtMs);
  return view;
}
