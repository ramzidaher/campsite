import { AppShell } from '@/components/AppShell';
import type { TopBarNotificationItem } from '@/components/shell/AppTopBar';
import { MainProviders } from '@/components/providers/MainProviders';
import { ThemeRoot } from '@/components/ThemeRoot';
import {
  getMainShellAdminNavItemsByPermissions,
  getMainShellManagerNavItemsByPermissions,
  getMainShellManagerNavSectionLabel,
} from '@/lib/adminGates';
import { countPendingBroadcastApprovalsForViewer } from '@/lib/broadcasts/countPendingBroadcastApprovalsForViewer';
import { createClient } from '@/lib/supabase/server';
import {
  type PermissionKey,
} from '@campsite/types';

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileRole: string | null = null;
  let orgName = 'Organisation';
  let orgLogoUrl: string | null = null;
  let userName = 'Account';
  let userAvatarUrl: string | null = null;
  let userRoleLabel = '';
  let hasTenantProfile = false;
  let deptLine: string | null = null;
  let unreadBroadcasts = 0;
  let pendingApprovalCount = 0;
  let pendingBroadcastApprovals = 0;
  let rotaPendingFinalCount = 0;
  let rotaPendingPeerCount = 0;
  let recruitmentPendingReviewCount = 0;
  let recruitmentUnreadNotifications = 0;
  let hasAdminAreaAccess = false;
  let canApproveRecruitment = false;
  let permissionKeys: PermissionKey[] = [];
  let showLeaveNav = false;
  let leaveNavBadge = 0;
  let showPerformanceNav = false;
  let performanceNavBadge = 0;
  let showOnboardingNav = false;
  if (user) {
    const emailLocal = user.email?.split('@')[0]?.trim() ?? '';

    const [profileRes, unreadRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, org_id, full_name, avatar_url, organisations(name, logo_url)')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.rpc('broadcast_unread_count'),
    ]);

    const profile = profileRes.data;
    hasTenantProfile = Boolean(profile);
    const rawRole = profile?.role as string | null | undefined;
    profileRole = rawRole != null && String(rawRole).trim() !== '' ? String(rawRole).trim() : null;
    userName = hasTenantProfile
      ? (profile?.full_name as string)?.trim() || emailLocal || 'Account'
      : emailLocal || 'Finish setup';
    userAvatarUrl = (profile?.avatar_url as string | null) ?? null;
    userRoleLabel = profileRole ? roleLabel(profileRole) : '';

    const orgId = profile?.org_id as string | undefined;
    const needsPendingBadge = Boolean(orgId);
    const needsBroadcastPendingBadge = Boolean(orgId);

    const orgEmbed = profile?.organisations as
      | { name: string; logo_url: string | null }
      | { name: string; logo_url: string | null }[]
      | null
      | undefined;
    const orgRow = Array.isArray(orgEmbed) ? orgEmbed[0] : orgEmbed;
    if (orgRow?.name) orgName = orgRow.name;
    if (orgRow && 'logo_url' in orgRow) orgLogoUrl = orgRow.logo_url ?? null;

    const uc = unreadRes.data;
    if (typeof uc === 'number') unreadBroadcasts = uc;
    else if (uc !== null && uc !== undefined) unreadBroadcasts = Number(uc);

    const [udRes, pendingRes, broadcastPendingCount] = await Promise.all([
      orgId
        ? supabase
            .from('user_departments')
            .select('departments(name)')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      needsPendingBadge
        ? supabase.rpc('pending_approvals_nav_count')
        : Promise.resolve({ data: null as number | null }),
      needsBroadcastPendingBadge && orgId && profileRole
        ? countPendingBroadcastApprovalsForViewer(supabase, {
            userId: user.id,
            orgId,
            role: profileRole,
          })
        : Promise.resolve(0),
    ]);

    if (orgId) {
      const ud = udRes.data as { departments?: unknown } | null;
      const d = ud?.departments as { name: string } | { name: string }[] | null;
      deptLine = Array.isArray(d) ? d[0]?.name ?? null : d?.name ?? null;
    }

    const pc = pendingRes.data;
    if (typeof pc === 'number') pendingApprovalCount = pc;
    else if (pc !== null && pc !== undefined) pendingApprovalCount = Number(pc);

    if (typeof broadcastPendingCount === 'number') pendingBroadcastApprovals = broadcastPendingCount;

    if (orgId) {
      const { data: perms } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
      if (Array.isArray(perms)) {
        permissionKeys = (perms as Array<{ permission_key?: string }>).map((p) =>
          String(p.permission_key ?? '')
        ) as PermissionKey[];
      }
      showLeaveNav =
        permissionKeys.includes('leave.view_own') ||
        permissionKeys.includes('leave.approve_direct_reports') ||
        permissionKeys.includes('leave.manage_org');
      if (
        showLeaveNav &&
        (permissionKeys.includes('leave.approve_direct_reports') ||
          permissionKeys.includes('leave.manage_org'))
      ) {
        const { data: lc } = await supabase.rpc('leave_pending_approval_count_for_me');
        if (typeof lc === 'number') leaveNavBadge = Math.max(0, lc);
        else if (lc !== null && lc !== undefined) leaveNavBadge = Math.max(0, Number(lc));
      }

      // Performance nav: show if user has any review (as reviewee or reviewer)
      if (permissionKeys.includes('performance.view_own') || permissionKeys.includes('performance.review_direct_reports')) {
        const { count: reviewCount } = await supabase
          .from('performance_reviews')
          .select('id', { count: 'exact', head: true })
          .or(`reviewee_id.eq.${user.id},reviewer_id.eq.${user.id}`);
        if ((reviewCount ?? 0) > 0) {
          showPerformanceNav = true;
          // badge = reviews where I'm the reviewer and status = self_submitted (awaiting my assessment)
          if (permissionKeys.includes('performance.review_direct_reports')) {
            const { count: pendingCount } = await supabase
              .from('performance_reviews')
              .select('id', { count: 'exact', head: true })
              .eq('reviewer_id', user.id)
              .eq('status', 'self_submitted');
            performanceNavBadge = Math.max(0, Number(pendingCount ?? 0));
          }
        }
      }

      // Onboarding nav: show if user has an active onboarding run
      if (permissionKeys.includes('onboarding.complete_own_tasks')) {
        const { count: runCount } = await supabase
          .from('onboarding_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'active');
        if ((runCount ?? 0) > 0) showOnboardingNav = true;
      }
    }
    hasAdminAreaAccess = permissionKeys.some(
      (k) =>
        k.startsWith('members.') ||
        k.startsWith('roles.') ||
        k.startsWith('recruitment.') ||
        k.startsWith('jobs.') ||
        k.startsWith('applications.') ||
        k.startsWith('offers.') ||
        k.startsWith('interviews.')
    );
    canApproveRecruitment = permissionKeys.includes('recruitment.approve_request');
    const needsRecruitmentBadge = Boolean(orgId && permissionKeys.includes('recruitment.approve_request'));

    const canApproveRota = permissionKeys.includes('rota.final_approve');
    const [rotaFinalRes, rotaPeerRes, recruitmentCountRes] = await Promise.all([
      canApproveRota
        ? supabase
            .from('rota_change_requests')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', orgId ?? '')
            .eq('status', 'pending_final')
        : Promise.resolve({ count: 0 }),
      supabase
        .from('rota_change_requests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId ?? '')
        .eq('counterparty_user_id', user.id)
        .eq('status', 'pending_peer'),
      needsRecruitmentBadge
        ? supabase.rpc('recruitment_requests_pending_review_count')
        : Promise.resolve({ data: null as number | null }),
    ]);
    rotaPendingFinalCount = Math.max(0, Number(rotaFinalRes.count ?? 0));
    rotaPendingPeerCount = Math.max(0, Number(rotaPeerRes.count ?? 0));

    const rc = recruitmentCountRes.data;
    if (typeof rc === 'number') recruitmentPendingReviewCount = rc;
    else if (rc !== null && rc !== undefined) recruitmentPendingReviewCount = Number(rc);
    recruitmentPendingReviewCount = Math.max(0, recruitmentPendingReviewCount);

    // In-app recruitment notifications (unread count for bell)
    const { data: rn } = await supabase.rpc('recruitment_notifications_unread_count');
    if (typeof rn === 'number') recruitmentUnreadNotifications = Math.max(0, rn);
    else if (rn !== null && rn !== undefined) recruitmentUnreadNotifications = Math.max(0, Number(rn));
  }

  const managerNavItems = getMainShellManagerNavItemsByPermissions(permissionKeys, {
    pendingApprovalCount,
    pendingBroadcastApprovals,
  });

  const adminNavItemsRaw = getMainShellAdminNavItemsByPermissions(permissionKeys);
  const adminNavItems =
    adminNavItemsRaw?.map((item) => {
      if (item.href === '/admin/pending' && pendingApprovalCount > 0) {
        return { ...item, badge: pendingApprovalCount };
      }
      if (item.href === '/hr/recruitment' && recruitmentPendingReviewCount > 0) {
        return { ...item, badge: recruitmentPendingReviewCount };
      }
      return item;
    }) ?? null;

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
          adminNavItems={adminNavItems}
          showStandaloneApprovals={showStandaloneApprovals}
          showLeaveNav={showLeaveNav}
          leaveNavBadge={leaveNavBadge}
          showPerformanceNav={showPerformanceNav}
          performanceNavBadge={performanceNavBadge}
          showOnboardingNav={showOnboardingNav}
        >
          {children}
        </AppShell>
      </MainProviders>
    </ThemeRoot>
  );
}
