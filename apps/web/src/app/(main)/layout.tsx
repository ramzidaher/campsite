import { AppShell } from '@/components/AppShell';
import type { TopBarNotificationItem } from '@/components/shell/AppTopBar';
import { OrgStateOverlay } from '@/components/tenant/OrgStateOverlay';
import { MainProviders } from '@/components/providers/MainProviders';
import { ThemeRoot } from '@/components/ThemeRoot';
import {
  getMainShellAdminNavItemsByPermissions,
  getMainShellFinanceNavItemsByPermissions,
  getMainShellHrNavItemsByPermissions,
  getMainShellManagerNavItemsByPermissions,
  getMainShellManagerNavSectionLabel,
} from '@/lib/adminGates';
import { CreditCard, Lock, Wrench } from 'lucide-react';
import { normalizeCelebrationMode } from '@/lib/holidayThemes';
import type { OrgCelebrationModeOverride } from '@/lib/holidayThemes';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { normalizeUiMode } from '@/lib/uiMode';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
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
  const pathStartedAtMs = Date.now();

  // Shell bundle is loaded once and cached per request so child routes reuse it.
  // Runtime loader prefers a single merged RPC on Nano to reduce round trips.
  const b = await withServerPerf('/(main)/layout', 'main_shell_layout_bundle_cached', getCachedMainShellLayoutBundle());
  const initialShellBadgeCounts = parseShellBadgeCounts(b);

  const str = (k: string): string | null =>
    typeof b[k] === 'string' ? (b[k] as string) : null;

  const isPlatformOperator = Boolean(b['is_platform_operator']);
  const hasOrgId = Boolean(str('org_id'));
  const orgIsLocked = Boolean(b['org_is_locked']);
  const orgMaintenanceMode = Boolean(b['org_maintenance_mode']);
  const orgSubscriptionStatus = str('org_subscription_status');
  const orgTrialEndsAtIso = str('org_subscription_trial_ends_at');
  const trialExpired =
    orgSubscriptionStatus === 'trial' &&
    Boolean(orgTrialEndsAtIso) &&
    !Number.isNaN(new Date(orgTrialEndsAtIso!).getTime()) &&
    new Date(orgTrialEndsAtIso!).getTime() < Date.now();

  const blockedState =
    !hasOrgId || isPlatformOperator
      ? null
      : orgIsLocked
        ? 'org_locked'
        : orgMaintenanceMode
          ? 'maintenance'
          : trialExpired
            ? 'trial_ended'
            : null;

  const num = (k: string): number => {
    const v = b[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
    if (v !== null && v !== undefined) return Math.max(0, Number(v));
    return 0;
  };

  const hasProfileFlag = b['has_profile'];
  const hasProfileState: true | false | 'unknown' =
    hasProfileFlag === true ? true : hasProfileFlag === false ? false : 'unknown';
  const hasProfile = hasProfileState === true;
  const profileSetupRequired = hasProfileState === false;
  const emailLocal     = str('email')?.split('@')[0]?.trim() ?? '';
  const profileRole    = str('profile_role')?.trim() || null;
  const currentOrgId   = str('org_id');
  const initialCelebrationMode = normalizeCelebrationMode(str('celebration_mode'));
  const initialUiMode = normalizeUiMode(str('ui_mode'));
  const shellDegraded = Boolean(b['shell_degraded']);
  const shellDegradedReason = str('shell_degraded_reason');
  const shellDataFreshness =
    str('shell_data_freshness') === 'fresh' ||
    str('shell_data_freshness') === 'stale' ||
    str('shell_data_freshness') === 'unknown'
      ? (str('shell_data_freshness') as 'fresh' | 'stale' | 'unknown')
      : shellDegraded
        ? 'stale'
        : 'unknown';
  const shellLastSuccessAt =
    typeof b['shell_last_success_at'] === 'number'
      ? (b['shell_last_success_at'] as number)
      : null;
  const initialCelebrationAutoEnabled =
    typeof b['celebration_auto_enabled'] === 'boolean' ? Boolean(b['celebration_auto_enabled']) : true;
  const rawCelebration = b['org_celebration_mode_overrides'];
  const orgCelebrationOverrides: OrgCelebrationModeOverride[] = Array.isArray(rawCelebration)
    ? (rawCelebration as OrgCelebrationModeOverride[])
    : [];

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
  const deptLine         = str('dept_name');

  const userName = hasProfile
    ? str('profile_full_name')?.trim() || emailLocal || 'Account'
    : profileSetupRequired
      ? emailLocal || 'Finish setup'
      : emailLocal || 'Account';

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
  const showAttendanceNav = hasTenantProfile;
  const showMyHrRecordNav = permissionKeys.includes('hr.view_own');
  const showOneOnOneNav =
    permissionKeys.includes('one_on_one.view_own') || permissionKeys.includes('hr.view_records');
  const showMemberSearch =
    permissionKeys.includes('hr.view_records') || permissionKeys.includes('hr.view_direct_reports');
  const managesPeople = permissionKeys.some(
    (k) =>
      k === 'recruitment.create_request' ||
      k === 'approvals.members.review' ||
      k === 'leave.approve_direct_reports' ||
      k === 'hr.view_direct_reports'
  );
  const userRoleLabel = managesPeople
    ? 'Manager'
    : profileRole === 'coordinator'
      ? 'Department'
      : profileRole
        ? roleLabel(profileRole)
        : '';
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

  const managerNavItems = managesPeople
    ? getMainShellManagerNavItemsByPermissions(permissionKeys, {
        pendingApprovalCount,
      })
    : null;

  const adminNavItemsRaw = getMainShellAdminNavItemsByPermissions(permissionKeys);
  const hrNavItemsRaw    = getMainShellHrNavItemsByPermissions(permissionKeys);
  const financeNavItemsRaw = getMainShellFinanceNavItemsByPermissions(permissionKeys);

  const mapHrBadges = <T extends { href: string }>(items: T[] | null) =>
    items?.map((item) => {
      if (item.href === '/admin/pending' && pendingApprovalCount > 0) {
        return { ...item, badge: pendingApprovalCount };
      }
      if (item.href === '/hr/hiring' && recruitmentPendingReviewCount > 0) {
        return { ...item, badge: recruitmentPendingReviewCount };
      }
      return item;
    }) ?? null;

  const adminNavItems = mapHrBadges(adminNavItemsRaw);
  const hrNavItems    = mapHrBadges(hrNavItemsRaw);
  const financeNavItems = mapHrBadges(financeNavItemsRaw);

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
      href: '/broadcasts?tab=submitted',
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
      href: '/hr/hiring/requests',
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
  const shellRealtimeUserId = str('user_id');
  const orgTimeZone = str('org_timezone')?.trim() || null;

  const view = (
    <ThemeRoot>
      <MainProviders
        reauthRequiredAt={profileReauthRequiredAt}
        skipTenantReauth={isPlatformOperator}
        shellRealtimeUserId={shellRealtimeUserId}
        shellRealtimeOrgId={currentOrgId}
        orgTimeZone={orgTimeZone}
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
          profileSetupRequired={profileSetupRequired}
          profileState={hasProfileState}
          deptLine={deptLine}
          profileRole={profileRole}
          shellDegraded={shellDegraded}
          shellDegradedReason={shellDegradedReason}
          shellDataFreshness={shellDataFreshness}
          shellLastSuccessAt={shellLastSuccessAt}
          initialShellBadgeCounts={initialShellBadgeCounts}
          unreadBroadcasts={unreadBroadcasts}
          pendingBroadcastApprovals={pendingBroadcastApprovals}
          pendingApprovalCount={pendingApprovalCount}
          rotaPendingFinalCount={rotaPendingFinalCount}
          rotaPendingPeerCount={rotaPendingPeerCount}
          topBarNotifications={topBarNotifications}
          managerNavItems={managerNavItems}
          managerNavSectionLabel={
            managerNavItems && profileRole ? getMainShellManagerNavSectionLabel(profileRole) : 'Manager'
          }
          hrNavItems={hrNavItems}
          financeNavItems={financeNavItems}
          adminNavItems={adminNavItems}
          showStandaloneApprovals={showStandaloneApprovals}
          showLeaveNav={showLeaveNav}
          showAttendanceNav={showAttendanceNav}
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
          <>
            {children}
            {blockedState === 'maintenance' ? (
              <OrgStateOverlay
                icon={Wrench}
                title="We'll be back shortly"
                message="Your organisation is temporarily in maintenance mode while updates are being applied. Please check back in a little while."
                actionHref="/login"
                actionLabel="Sign out"
                footerText="If this continues, contact your organisation admin."
              />
            ) : null}
            {blockedState === 'org_locked' ? (
              <OrgStateOverlay
                icon={Lock}
                title="Account locked"
                message="Access to this organisation is currently locked. Billing or subscription updates may be required before access can be restored."
                actionHref="/login"
                actionLabel="Sign out"
                footerText="You can use another account, or wait for your organisation admin to restore access."
              />
            ) : null}
            {blockedState === 'trial_ended' ? (
              <OrgStateOverlay
                icon={CreditCard}
                title="Trial ended"
                message="Your organisation's trial period has ended. A subscription step is now needed to continue using Campsite."
                actionHref="/login"
                actionLabel="Sign out"
                footerText="Ask your organisation admin to complete billing activation."
              />
            ) : null}
          </>
        </AppShell>
      </MainProviders>
    </ThemeRoot>
  );

  warnIfSlowServerPath('/(main)/layout', pathStartedAtMs);
  return view;
}
