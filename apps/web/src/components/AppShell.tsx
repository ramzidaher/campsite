'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';
import { AppTopBar } from '@/components/shell/AppTopBar';
import type { TopBarNotificationItem } from '@/components/shell/AppTopBar';
import { ShellNavIcon } from '@/components/shell/ShellNavIcon';
import type { MainShellAdminNavItem, ShellNavIconId } from '@/lib/adminGates';
import { useShellBadgeCounts } from '@/hooks/useShellBadgeCounts';
import type { ShellBadgeCounts } from '@/hooks/useShellBadgeCounts';
import { CheckboxUiSoundCapture } from '@/components/sound/CheckboxUiSoundCapture';
import { useUiSound } from '@/lib/sound/useUiSound';
import { ChevronDown } from 'lucide-react';
import { isApproverRole } from '@campsite/types';

const ADMIN_NAV_EXPANDED_KEY = 'campsite_nav_admin_expanded';
const MANAGER_NAV_EXPANDED_KEY = 'campsite_nav_manager_expanded';
const HR_NAV_EXPANDED_KEY = 'campsite_nav_hr_expanded';

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

/** Only allow http(s) image URLs for org logo (same idea as registration avatar). */
function safeHttpImageUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return t;
  } catch {
    return null;
  }
}

function NavLink({
  href,
  icon,
  label,
  badge,
  secondaryBadge,
  secondaryBadgeTitle,
  exact,
  onNavigate,
}: {
  href: string;
  icon: ShellNavIconId;
  label: string;
  badge?: number;
  /** e.g. broadcasts awaiting approval (shown beside unread). */
  secondaryBadge?: number;
  secondaryBadgeTitle?: string;
  /** When true, only this path counts as active (e.g. `/admin` vs `/admin/users`). */
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const active = exact
    ? pathname === href
    : pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
        active
          ? 'bg-white/[0.12] font-medium text-[#faf9f6]'
          : 'text-white/55 hover:bg-white/[0.07] hover:text-white/85',
      ].join(' ')}
    >
      <span className="flex w-5 shrink-0 items-center justify-center text-current">
        <ShellNavIcon name={icon} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {secondaryBadge !== undefined && secondaryBadge > 0 ? (
          <span
            className="min-w-[18px] rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-semibold text-amber-950"
            title={secondaryBadgeTitle ?? 'Needs attention'}
          >
            {secondaryBadge > 99 ? '99+' : secondaryBadge}
          </span>
        ) : null}
        {badge !== undefined && badge > 0 ? (
          <span
            className="min-w-[18px] rounded-full bg-[#E11D48] px-1.5 py-0.5 text-center text-[10px] font-semibold text-white"
            title="Unread"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function AppShell({
  children,
  orgName,
  orgLogoUrl = null,
  userName,
  userAvatarUrl = null,
  userRoleLabel,
  hasTenantProfile,
  deptLine,
  profileRole,
  unreadBroadcasts,
  pendingBroadcastApprovals,
  pendingApprovalCount,
  rotaPendingFinalCount,
  rotaPendingPeerCount,
  recruitmentPendingReviewCount = 0,
  topBarNotifications,
  showLeaveNav = false,
  leaveNavBadge = 0,
  showPerformanceNav = false,
  performanceNavBadge = 0,
  showOnboardingNav = false,
  showOneOnOneNav = false,
  showMyHrRecordNav = false,
  showMemberSearch = false,
  orgId = null,
  managerNavItems = null,
  managerNavSectionLabel = 'Manager',
  hrNavItems = null,
  adminNavItems = null,
  showStandaloneApprovals = true,
}: {
  children: React.ReactNode;
  orgName: string;
  /** Public image URL from `organisations.logo_url` when set. */
  orgLogoUrl?: string | null;
  userName: string;
  userAvatarUrl?: string | null;
  userRoleLabel: string;
  /** False when signed in but no `profiles` row yet (e.g. mid-registration). */
  hasTenantProfile: boolean;
  deptLine: string | null;
  profileRole: string | null;
  unreadBroadcasts: number;
  /** Broadcasts in pending_approval the user can approve (managers: scoped depts). */
  pendingBroadcastApprovals: number;
  pendingApprovalCount: number;
  rotaPendingFinalCount: number;
  rotaPendingPeerCount: number;
  /** Open recruitment requests in `pending_review` (org admins only; layout passes 0 for others). */
  recruitmentPendingReviewCount?: number;
  topBarNotifications: TopBarNotificationItem[];
  showLeaveNav?: boolean;
  leaveNavBadge?: number;
  showPerformanceNav?: boolean;
  /** Pending manager assessments count badge on the performance nav link. */
  performanceNavBadge?: number;
  showOnboardingNav?: boolean;
  showOneOnOneNav?: boolean;
  showMyHrRecordNav?: boolean;
  /** When true, top bar search includes people (HR). */
  showMemberSearch?: boolean;
  orgId?: string | null;
  /** Collapsible “Manager” links (same pattern as `adminNavItems`). */
  managerNavItems?: MainShellAdminNavItem[] | null;
  /** Sidebar group title (e.g. “Department” for coordinators). */
  managerNavSectionLabel?: string;
  /** Collapsible HR links (separate from Admin and Manager). */
  hrNavItems?: MainShellAdminNavItem[] | null;
  adminNavItems?: MainShellAdminNavItem[] | null;
  /** Managers use the Manager section; other approvers use this standalone link. */
  showStandaloneApprovals?: boolean;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const [adminNavExpanded, setAdminNavExpanded] = useState(true);
  const [managerNavExpanded, setManagerNavExpanded] = useState(true);
  const [hrNavExpanded, setHrNavExpanded] = useState(true);
  const [orgLogoFailed, setOrgLogoFailed] = useState(false);
  const [userAvatarFailed, setUserAvatarFailed] = useState(false);
  const playUiSound = useUiSound();

  // Live badge counts — polled every 60 s and on window focus.
  // Server props provide the correct initial values (no flash of zeros);
  // the hook takes over silently once it loads.
  const { data: live } = useShellBadgeCounts();

  const bc = (key: keyof ShellBadgeCounts, fallback: number) =>
    live ? live[key] : fallback;

  const liveUnreadBroadcasts          = bc('broadcast_unread',           unreadBroadcasts);
  const livePendingBroadcastApprovals = bc('broadcast_pending_approvals', pendingBroadcastApprovals);
  const livePendingApprovalCount      = bc('pending_approvals',           pendingApprovalCount);
  const liveRotaPendingFinalCount     = bc('rota_pending_final',          rotaPendingFinalCount);
  const liveRotaPendingPeerCount      = bc('rota_pending_peer',           rotaPendingPeerCount);
  const liveRecruitmentPendingCount   = bc('recruitment_pending_review',  recruitmentPendingReviewCount);
  const liveLeaveNavBadge             = bc('leave_pending_approval',      leaveNavBadge);
  const livePerformanceNavBadge       = bc('performance_pending',         performanceNavBadge);
  const liveShowOnboardingNav         = showOnboardingNav || (live?.onboarding_active ?? 0) > 0;

  // Override badges embedded inside nav-item objects (admin/manager/HR lists).
  const withLiveBadge = (item: MainShellAdminNavItem): MainShellAdminNavItem => {
    if (!live) return item;
    switch (item.href) {
      case '/admin/pending':
      case '/pending-approvals':
        return { ...item, badge: live.pending_approvals || undefined };
      case '/hr/recruitment':
        return { ...item, badge: live.recruitment_pending_review || undefined };
      case '/broadcasts':
        return { ...item, secondaryBadge: live.broadcast_pending_approvals || undefined };
      default:
        return item;
    }
  };

  // Top-bar notification bell — rebuilt from live counts so new items appear
  // even if they were zero on the initial server render (and thus filtered out).
  const liveTopBarNotifications = useMemo<TopBarNotificationItem[]>(() => {
    if (!live) return topBarNotifications;
    const isAdmin = adminNavItems !== null;
    return (
      [
        { id: 'broadcast-unread',           label: 'Unread broadcasts',              href: '/broadcasts',                   count: live.broadcast_unread },
        { id: 'broadcast-pending',          label: 'Broadcast approvals',            href: '/broadcasts?tab=pending',       count: live.broadcast_pending_approvals },
        { id: 'profile-pending',            label: 'Pending member approvals',       href: isAdmin ? '/admin/pending' : '/pending-approvals', count: live.pending_approvals },
        { id: 'rota-peer',                  label: 'Rota swaps awaiting your OK',    href: '/rota',                         count: live.rota_pending_peer },
        { id: 'rota-final',                 label: 'Rota requests awaiting approval',href: '/rota',                         count: live.rota_pending_final },
        { id: 'recruitment-pending',        label: 'Recruitment requests to review', href: '/hr/recruitment',               count: live.recruitment_pending_review },
        { id: 'leave-pending',              label: 'Leave requests to approve',      href: '/leave',                        count: live.leave_pending_approval },
        { id: 'recruitment-notifications',  label: 'Recruitment updates',            href: '/notifications/recruitment',    count: live.recruitment_notifications },
        { id: 'application-notifications',  label: 'Application updates',            href: '/notifications/applications',   count: live.application_notifications },
        { id: 'leave-notifications',        label: 'Time off updates',               href: '/notifications/leave',          count: live.leave_notifications },
        { id: 'hr-metric-notifications',    label: 'HR metric alerts',               href: '/notifications/hr-metrics',     count: live.hr_metric_notifications },
      ] satisfies TopBarNotificationItem[]
    ).filter((item) => item.count > 0);
  }, [live, topBarNotifications, adminNavItems]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADMIN_NAV_EXPANDED_KEY);
      if (stored === '0') setAdminNavExpanded(false);
      else if (stored === '1') setAdminNavExpanded(true);
      const mgr = localStorage.getItem(MANAGER_NAV_EXPANDED_KEY);
      if (mgr === '0') setManagerNavExpanded(false);
      else if (mgr === '1') setManagerNavExpanded(true);
      const hr = localStorage.getItem(HR_NAV_EXPANDED_KEY);
      if (hr === '0') setHrNavExpanded(false);
      else if (hr === '1') setHrNavExpanded(true);
    } catch {
      /* ignore */
    }
  }, []);

  const safeOrgLogo = useMemo(() => safeHttpImageUrl(orgLogoUrl ?? null), [orgLogoUrl]);
  useEffect(() => {
    setOrgLogoFailed(false);
  }, [safeOrgLogo]);

  const safeUserAvatar = useMemo(() => safeHttpImageUrl(userAvatarUrl ?? null), [userAvatarUrl]);
  useEffect(() => {
    setUserAvatarFailed(false);
  }, [safeUserAvatar]);

  const showApprovals = isApproverRole(profileRole);
  const totalNotifCount = useMemo(
    () => liveTopBarNotifications.reduce((sum, item) => sum + item.count, 0),
    [liveTopBarNotifications]
  );
  const userInitials = useMemo(() => initials(userName), [userName]);
  const orgInitials = useMemo(() => initials(orgName), [orgName]);
  const showOrgLogo = Boolean(safeOrgLogo) && !orgLogoFailed;
  const showUserAvatar = Boolean(safeUserAvatar) && !userAvatarFailed;

  const closeMobile = () => {
    setMobileNav(false);
    playUiSound('menu_close');
  };

  return (
    <div className="campsite-paper flex min-h-screen bg-[#faf9f6] text-[#121212]">
      <CheckboxUiSoundCapture />
      {mobileNav ? (
        <button
          type="button"
          className="fixed inset-0 z-[90] bg-black/40 md:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      ) : null}

      <aside
        className={[
          'fixed left-0 top-0 z-[100] flex h-screen w-[240px] shrink-0 flex-col overflow-hidden bg-[#121212] text-[#faf9f6] transition-transform md:translate-x-0',
          mobileNav ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        <Link
          href="/dashboard"
          onClick={closeMobile}
          className="relative z-[1] flex items-center gap-2.5 border-b border-white/[0.07] px-5 py-5"
        >
          <CampsiteLogoMark className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-white/[0.12]" />
          <span className="font-authSerif text-[19px] tracking-tight text-[#faf9f6]">Campsite</span>
        </Link>

        <div className="relative z-[1] border-b border-white/[0.07] px-5 py-3">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-white/[0.07] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.11]"
            title="Organisation"
          >
            <div className="flex h-6 w-6 shrink-0 overflow-hidden rounded-[5px] bg-white/20 text-[11px] font-semibold text-white">
              {showOrgLogo ? (
                <img
                  src={safeOrgLogo!}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setOrgLogoFailed(true)}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center">{orgInitials}</span>
              )}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/[0.8]">{orgName}</span>
          </button>
        </div>

        <nav
          className="shell-sidebar-scroll relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-3 pt-2 [scrollbar-gutter:stable]"
          aria-label="Main"
        >
          <div className="space-y-0.5">
            <NavLink href="/dashboard" icon="dashboard" label="Dashboard" onNavigate={closeMobile} />
            {showMyHrRecordNav ? (
              <NavLink
                href="/profile"
                icon="userProfile"
                label="My Profile"
                onNavigate={closeMobile}
              />
            ) : null}
            <NavLink
              href="/broadcasts"
              icon="broadcasts"
              label="Broadcasts"
              secondaryBadge={livePendingBroadcastApprovals > 0 ? livePendingBroadcastApprovals : undefined}
              secondaryBadgeTitle="Broadcasts awaiting your approval"
              badge={liveUnreadBroadcasts > 0 ? liveUnreadBroadcasts : undefined}
              onNavigate={closeMobile}
            />
            <NavLink href="/resources" icon="resources" label="Resource library" onNavigate={closeMobile} />
            <NavLink href="/calendar" icon="calendar" label="Calendar" onNavigate={closeMobile} />
            <NavLink
              href="/rota"
              icon="rota"
              label="Rota"
              badge={
                liveRotaPendingFinalCount + liveRotaPendingPeerCount > 0
                  ? liveRotaPendingFinalCount + liveRotaPendingPeerCount
                  : undefined
              }
              onNavigate={closeMobile}
            />
            <NavLink href="/discount" icon="discount" label="Discount Card" onNavigate={closeMobile} />
            {showLeaveNav ? (
              <NavLink
                href="/leave"
                icon="leave"
                label="Leave"
                badge={liveLeaveNavBadge > 0 ? liveLeaveNavBadge : undefined}
                onNavigate={closeMobile}
              />
            ) : null}
            {showPerformanceNav ? (
              <NavLink
                href="/performance"
                icon="performance"
                label="Performance"
                badge={livePerformanceNavBadge > 0 ? livePerformanceNavBadge : undefined}
                onNavigate={closeMobile}
              />
            ) : null}
            {showOneOnOneNav ? (
              <NavLink href="/one-on-ones" icon="manager" label="1:1 check-ins" onNavigate={closeMobile} />
            ) : null}
            {liveShowOnboardingNav ? (
              <NavLink
                href="/onboarding"
                icon="onboarding"
                label="Onboarding"
                onNavigate={closeMobile}
              />
            ) : null}
          </div>

          {adminNavItems && adminNavItems.length > 0 ? (
            <div
              className="mt-3 rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
              style={{ order: 30 }}
            >
              <button
                type="button"
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors',
                  adminNavExpanded
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/55 hover:bg-white/[0.07] hover:text-white/85',
                ].join(' ')}
                aria-expanded={adminNavExpanded}
                aria-controls="admin-shell-nav-items"
                id="admin-shell-nav-trigger"
                onClick={() => {
                  setAdminNavExpanded((open) => {
                    const next = !open;
                    playUiSound(next ? 'folder_open' : 'folder_close');
                    try {
                      localStorage.setItem(ADMIN_NAV_EXPANDED_KEY, next ? '1' : '0');
                      if (next) {
                        localStorage.setItem(MANAGER_NAV_EXPANDED_KEY, '0');
                        localStorage.setItem(HR_NAV_EXPANDED_KEY, '0');
                      }
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                  setManagerNavExpanded(false);
                  setHrNavExpanded(false);
                }}
              >
                <span className="flex w-5 shrink-0 items-center justify-center text-current">
                  <ShellNavIcon name="settings" open={adminNavExpanded} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  Admin
                </span>
                <ChevronDown
                  className={[
                    'shrink-0 text-white/45 transition-transform duration-200',
                    adminNavExpanded ? 'rotate-0' : '-rotate-90',
                  ].join(' ')}
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              <div
                id="admin-shell-nav-items"
                role="region"
                aria-labelledby="admin-shell-nav-trigger"
                className={[
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  adminNavExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                ].join(' ')}
              >
                <div className="min-h-0 overflow-hidden" inert={!adminNavExpanded ? true : undefined}>
                  <div className="relative mt-0.5 space-y-0.5 border-l border-white/[0.14] pl-2.5 ml-2.5 pb-1 pt-0.5">
                    {adminNavItems.map((item, idx) => {
                      const item_ = withLiveBadge(item);
                      const prev = idx > 0 ? adminNavItems[idx - 1] : undefined;
                      const showSection =
                        Boolean(item.section) && (!prev || prev.section !== item.section);
                      return (
                        <Fragment key={item.href}>
                          {showSection ? (
                            <div className="border-t border-white/[0.07] pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/38">
                              {item.section}
                            </div>
                          ) : null}
                          <NavLink
                            href={item_.href}
                            icon={item_.icon}
                            label={item_.label}
                            badge={item_.badge}
                            secondaryBadge={item_.secondaryBadge}
                            secondaryBadgeTitle={item_.secondaryBadgeTitle}
                            exact={item_.exact ?? item_.href === '/admin'}
                            onNavigate={closeMobile}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {managerNavItems && managerNavItems.length > 0 ? (
            <div
              className="mt-3 rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
              style={{ order: 10 }}
            >
              <button
                type="button"
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors',
                  managerNavExpanded
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/55 hover:bg-white/[0.07] hover:text-white/85',
                ].join(' ')}
                aria-expanded={managerNavExpanded}
                aria-controls="manager-shell-nav-items"
                id="manager-shell-nav-trigger"
                onClick={() => {
                  setManagerNavExpanded((open) => {
                    const next = !open;
                    playUiSound(next ? 'folder_open' : 'folder_close');
                    try {
                      localStorage.setItem(MANAGER_NAV_EXPANDED_KEY, next ? '1' : '0');
                      if (next) {
                        localStorage.setItem(ADMIN_NAV_EXPANDED_KEY, '0');
                        localStorage.setItem(HR_NAV_EXPANDED_KEY, '0');
                      }
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                  setAdminNavExpanded(false);
                  setHrNavExpanded(false);
                }}
              >
                <span className="flex w-5 shrink-0 items-center justify-center text-current">
                  <ShellNavIcon name="manager" open={managerNavExpanded} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  {managerNavSectionLabel}
                </span>
                <ChevronDown
                  className={[
                    'shrink-0 text-white/45 transition-transform duration-200',
                    managerNavExpanded ? 'rotate-0' : '-rotate-90',
                  ].join(' ')}
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              <div
                id="manager-shell-nav-items"
                role="region"
                aria-labelledby="manager-shell-nav-trigger"
                className={[
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  managerNavExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                ].join(' ')}
              >
                <div className="min-h-0 overflow-hidden" inert={!managerNavExpanded ? true : undefined}>
                  <div className="relative mt-0.5 space-y-0.5 border-l border-white/[0.14] pl-2.5 ml-2.5 pb-1 pt-0.5">
                    {managerNavItems.map((item, idx) => {
                      const item_ = withLiveBadge(item);
                      const prev = idx > 0 ? managerNavItems[idx - 1] : undefined;
                      const showSection =
                        Boolean(item.section) && (!prev || prev.section !== item.section);
                      return (
                        <Fragment key={`${item.href}-${item.label}`}>
                          {showSection ? (
                            <div className="border-t border-white/[0.07] pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/38">
                              {item.section}
                            </div>
                          ) : null}
                          <NavLink
                            href={item_.href}
                            icon={item_.icon}
                            label={item_.label}
                            badge={item_.badge}
                            secondaryBadge={item_.secondaryBadge}
                            secondaryBadgeTitle={item_.secondaryBadgeTitle}
                            exact={item_.exact ?? item_.href === '/manager'}
                            onNavigate={closeMobile}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {hrNavItems && hrNavItems.length > 0 ? (
            <div
              className="mt-3 rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
              style={{ order: 20 }}
            >
              <button
                type="button"
                className={[
                  'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors',
                  hrNavExpanded
                    ? 'bg-white/[0.08] text-white/80'
                    : 'text-white/55 hover:bg-white/[0.07] hover:text-white/85',
                ].join(' ')}
                aria-expanded={hrNavExpanded}
                aria-controls="hr-shell-nav-items"
                id="hr-shell-nav-trigger"
                onClick={() => {
                  setHrNavExpanded((open) => {
                    const next = !open;
                    playUiSound(next ? 'folder_open' : 'folder_close');
                    try {
                      localStorage.setItem(HR_NAV_EXPANDED_KEY, next ? '1' : '0');
                      if (next) {
                        localStorage.setItem(ADMIN_NAV_EXPANDED_KEY, '0');
                        localStorage.setItem(MANAGER_NAV_EXPANDED_KEY, '0');
                      }
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                  setAdminNavExpanded(false);
                  setManagerNavExpanded(false);
                }}
              >
                <span className="flex w-5 shrink-0 items-center justify-center text-current">
                  <ShellNavIcon name="hrRecords" open={hrNavExpanded} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  HR
                </span>
                <ChevronDown
                  className={[
                    'shrink-0 text-white/45 transition-transform duration-200',
                    hrNavExpanded ? 'rotate-0' : '-rotate-90',
                  ].join(' ')}
                  size={14}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
              <div
                id="hr-shell-nav-items"
                role="region"
                aria-labelledby="hr-shell-nav-trigger"
                className={[
                  'grid transition-[grid-template-rows] duration-200 ease-out',
                  hrNavExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                ].join(' ')}
              >
                <div className="min-h-0 overflow-hidden" inert={!hrNavExpanded ? true : undefined}>
                  <div className="relative mt-0.5 space-y-0.5 border-l border-white/[0.14] pl-2.5 ml-2.5 pb-1 pt-0.5">
                    {hrNavItems.map((item) => {
                      const item_ = withLiveBadge(item);
                      return (
                      <div
                        key={item_.href}
                        className={
                          item_.nested
                            ? 'ml-2 border-l border-white/[0.12] pl-2'
                            : undefined
                        }
                      >
                        <NavLink
                          href={item_.href}
                          icon={item_.icon}
                          label={item_.label}
                          badge={item_.badge}
                          secondaryBadge={item_.secondaryBadge}
                          secondaryBadgeTitle={item_.secondaryBadgeTitle}
                          exact={item_.exact}
                          onNavigate={closeMobile}
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {showApprovals && showStandaloneApprovals ? (
            <div className="mt-3 space-y-0.5" style={{ order: 40 }}>
              <NavLink
                href="/pending-approvals"
                icon="pending"
                label="Approvals"
                badge={livePendingApprovalCount > 0 ? livePendingApprovalCount : undefined}
                onNavigate={closeMobile}
              />
            </div>
          ) : null}
        </nav>

        <Link
          href="/settings"
          onClick={closeMobile}
          className="relative z-[1] mt-auto flex items-center gap-2.5 border-t border-white/[0.07] px-3 py-3.5 transition-colors hover:bg-white/[0.06]"
        >
          <div className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/[0.18] text-[13px] font-semibold text-[#faf9f6]">
            {showUserAvatar ? (
              <img
                src={safeUserAvatar!}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setUserAvatarFailed(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">{userInitials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="truncate text-[12.5px] font-medium text-white/[0.85]">{userName}</div>
            <div className="truncate text-[11px] text-white/35">
              {hasTenantProfile ? (
                <>
                  {userRoleLabel}
                  {deptLine ? ` · ${deptLine}` : ''}
                </>
              ) : (
                'Finish registration'
              )}
            </div>
          </div>
          <span className="flex shrink-0 text-white/30">
            <ShellNavIcon name="settings" />
          </span>
        </Link>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:ml-[240px]">
        <div className="flex h-[60px] items-center border-b border-[#d8d8d8] bg-[#121212] px-4 md:hidden">
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
            onClick={() => {
              setMobileNav(true);
              playUiSound('menu_open');
            }}
          >
            Menu
          </button>
          <span className="ml-3 font-authSerif text-lg text-white">Campsite</span>
        </div>
        <AppTopBar
          userInitials={userInitials}
          avatarImageSrc={showUserAvatar ? safeUserAvatar! : null}
          onAvatarImageError={() => setUserAvatarFailed(true)}
          notificationCount={totalNotifCount}
          notifications={liveTopBarNotifications}
          showMemberSearch={showMemberSearch}
          orgId={orgId}
        />
        <div className="flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
