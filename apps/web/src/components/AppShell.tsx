'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { AppTopBar } from '@/components/shell/AppTopBar';
import type { MainShellAdminNavItem } from '@/lib/adminGates';
import { isApproverRole } from '@campsite/types';

const ADMIN_NAV_EXPANDED_KEY = 'campsite_nav_admin_expanded';

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
  exact,
  onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  badge?: number;
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
      <span className="w-5 shrink-0 text-center text-[15px]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="ml-auto min-w-[18px] shrink-0 rounded-full bg-[#E11D48] px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
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
  pendingApprovalCount,
  showManager,
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
  pendingApprovalCount: number;
  showManager: boolean;
  adminNavItems?: MainShellAdminNavItem[] | null;
  /** Managers use `/pending-approvals`; org admins use Admin → Pending. */
  showStandaloneApprovals?: boolean;
}) {
  const [mobileNav, setMobileNav] = useState(false);
  const [adminNavExpanded, setAdminNavExpanded] = useState(true);
  const [orgLogoFailed, setOrgLogoFailed] = useState(false);
  const [userAvatarFailed, setUserAvatarFailed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADMIN_NAV_EXPANDED_KEY);
      if (stored === '0') setAdminNavExpanded(false);
      else if (stored === '1') setAdminNavExpanded(true);
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
  const userInitials = useMemo(() => initials(userName), [userName]);
  const orgInitials = useMemo(() => initials(orgName), [orgName]);
  const showOrgLogo = Boolean(safeOrgLogo) && !orgLogoFailed;
  const showUserAvatar = Boolean(safeUserAvatar) && !userAvatarFailed;

  const closeMobile = () => setMobileNav(false);

  return (
    <div className="campsite-paper flex min-h-screen bg-[var(--campsite-bg)] text-[var(--campsite-text)]">
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
        <div className="relative z-[1] flex items-center gap-2.5 border-b border-white/[0.07] px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.12] text-[15px]">
            ⛺
          </div>
          <span className="font-authSerif text-[19px] tracking-tight text-[#faf9f6]">Campsite</span>
        </div>

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
            <span className="shrink-0 text-[10px] text-white/35">⌄</span>
          </button>
        </div>

        <nav
          className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-3 pt-2 [scrollbar-gutter:stable]"
          aria-label="Main"
        >
          <div className="space-y-0.5">
            <NavLink href="/dashboard" icon="📊" label="Dashboard" onNavigate={closeMobile} />
            <NavLink
              href="/broadcasts"
              icon="📡"
              label="Broadcasts"
              badge={unreadBroadcasts > 0 ? unreadBroadcasts : undefined}
              onNavigate={closeMobile}
            />
            <NavLink href="/calendar" icon="📅" label="Calendar" onNavigate={closeMobile} />
            <NavLink href="/rota" icon="🗓" label="Rota" onNavigate={closeMobile} />
            <NavLink href="/discount" icon="🎫" label="Discount Card" onNavigate={closeMobile} />
          </div>

          {adminNavItems && adminNavItems.length > 0 ? (
            <div className="mt-3 rounded-[10px] border border-white/[0.1] bg-white/[0.04] p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
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
                    try {
                      localStorage.setItem(ADMIN_NAV_EXPANDED_KEY, next ? '1' : '0');
                    } catch {
                      /* ignore */
                    }
                    return next;
                  });
                }}
              >
                <span className="w-5 shrink-0 text-center text-[15px]">⚙</span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                  Admin
                </span>
                <span
                  className={[
                    'shrink-0 text-[10px] text-white/45 transition-transform duration-200',
                    adminNavExpanded ? 'rotate-0' : '-rotate-90',
                  ].join(' ')}
                  aria-hidden
                >
                  ⌄
                </span>
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
                            href={item.href}
                            icon={item.icon}
                            label={item.label}
                            badge={item.badge}
                            exact={item.href === '/admin'}
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

          {showApprovals && showStandaloneApprovals ? (
            <div className="mt-3 space-y-0.5">
              <NavLink
                href="/pending-approvals"
                icon="⏳"
                label="Approvals"
                badge={pendingApprovalCount > 0 ? pendingApprovalCount : undefined}
                onNavigate={closeMobile}
              />
            </div>
          ) : null}

          {showManager ? (
            <div className="mt-3">
              <div className="px-2 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35">
                Manager
              </div>
              <NavLink href="/manager" icon="📋" label="Manager" onNavigate={closeMobile} />
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
          <span className="shrink-0 text-sm text-white/30">⚙</span>
        </Link>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:ml-[240px]">
        <div className="flex h-[60px] items-center border-b border-[#d8d8d8] bg-[#121212] px-4 md:hidden">
          <button
            type="button"
            className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
            onClick={() => setMobileNav(true)}
          >
            Menu
          </button>
          <span className="ml-3 font-authSerif text-lg text-white">Campsite</span>
        </div>
        <AppTopBar
          userInitials={userInitials}
          avatarImageSrc={showUserAvatar ? safeUserAvatar! : null}
          onAvatarImageError={() => setUserAvatarFailed(true)}
          hasNotifDot={unreadBroadcasts > 0}
        />
        <div className="flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
