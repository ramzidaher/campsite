'use client';

import { SectionNav, type SectionNavItem } from '@campsite/ui/web';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import type { MainShellAdminNavItem } from '@/lib/adminGates';
import { hrBreadcrumbTrail } from '@/lib/hr/hrPathLabels';

function inHrShellNav(item: MainShellAdminNavItem): boolean {
  return item.href.startsWith('/hr');
}

export function HrWorkspaceShell({
  navItems,
  children,
}: {
  navItems: MainShellAdminNavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const shellLinks = useMemo((): MainShellAdminNavItem[] => {
    const home: MainShellAdminNavItem = { href: '/hr', label: 'Home', icon: 'dashboard' };
    const hrOnly = navItems.filter(inHrShellNav);
    const seen = new Set<string>();
    const deduped: MainShellAdminNavItem[] = [];
    for (const it of hrOnly) {
      if (seen.has(it.href)) continue;
      seen.add(it.href);
      deduped.push(it);
    }
    return [home, ...deduped] satisfies MainShellAdminNavItem[];
  }, [navItems]);

  const trail = useMemo(() => hrBreadcrumbTrail(pathname), [pathname]);
  const showChrome = pathname.startsWith('/hr');
  const isPeopleHome = pathname === '/hr';
  const hiringHub = pathname.startsWith('/hr/hiring');
  /** Job editor only — same focused chrome as hiring (no People workspace mega-nav on top of page chrome). */
  const jobListingEditor = /^\/hr\/jobs\/[^/]+\/edit$/.test(pathname);
  const suppressMainHrHeader = hiringHub || jobListingEditor;
  const shellWideLayout = hiringHub || jobListingEditor;

  const shellNavItems = useMemo((): SectionNavItem[] => {
    return shellLinks.map((it) => ({ href: it.href, label: it.label, badge: it.badge }));
  }, [shellLinks]);

  /**
   * Bamboo-style: when the horizontal tab already names this page, skip repeating the same word in a trail.
   * Still show crumbs when the trail adds context (e.g. detail pages) or labels differ from the tab.
   */
  const hideBreadcrumbTrail = useMemo(() => {
    if (trail.length === 0) return true;
    const last = trail[trail.length - 1];
    if (!last || last.href !== pathname) return false;
    const activeTab = shellLinks.find((l) => l.href === pathname && l.href !== '/hr');
    if (!activeTab) return false;
    return last.label === activeTab.label;
  }, [trail, pathname, shellLinks]);

  if (!showChrome) return <>{children}</>;

  return (
    <div
      className={[
        'mx-auto min-w-0 py-8',
        shellWideLayout ? 'max-w-[90rem] px-5 sm:px-8 lg:px-10' : 'max-w-7xl px-5 sm:px-7',
      ].join(' ')}
    >
      {isPeopleHome ? null : suppressMainHrHeader ? null : (
        <header className="mb-8 border-b border-[#e8e8e8] pb-6">
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">People workspace</p>
          {!hideBreadcrumbTrail ? (
            <nav aria-label="Breadcrumb" className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-[#6b6b6b]">
              <Link href="/hr" className="font-medium text-[#121212] underline-offset-2 hover:underline">
                Home
              </Link>
              {trail.map((t, i) => (
                <span key={`${t.href}-${i}`} className="flex flex-wrap items-center gap-1.5">
                  <span aria-hidden className="text-[#d0d0d0]">
                    /
                  </span>
                  {i === trail.length - 1 ? (
                    <span className="font-medium text-[#121212]">{t.label}</span>
                  ) : (
                    <Link href={t.href} className="font-medium text-[#121212] underline-offset-2 hover:underline">
                      {t.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          {shellLinks.length > 1 ? (
            <SectionNav className="mt-5" items={shellNavItems} pathname={pathname} aria-label="HR section" />
          ) : null}
        </header>
      )}
      {children}
    </div>
  );
}
