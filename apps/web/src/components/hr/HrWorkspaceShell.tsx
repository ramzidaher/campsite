'use client';

import { usePathname } from 'next/navigation';

export function HrWorkspaceShell({
  children,
}: {
  navItems: unknown[];
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const showChrome = pathname.startsWith('/hr');
  const hiringHub = pathname.startsWith('/hr/hiring');
  /** Job editor only  same focused chrome as hiring (no People workspace mega-nav on top of page chrome). */
  const jobListingEditor = /^\/hr\/jobs\/[^/]+\/edit$/.test(pathname);
  const shellWideLayout = hiringHub || jobListingEditor;
  /** Org chart is a full-width canvas; horizontal shell padding would read as empty gutters beside the grid. */
  const orgChartFullWidth = pathname === '/hr/org-chart';

  if (!showChrome) return <>{children}</>;

  const horizontalPad = orgChartFullWidth
    ? 'px-0'
    : shellWideLayout
      ? 'px-5 sm:px-8 lg:px-10'
      : 'px-5 sm:px-7';

  return (
    <div className={['min-w-0 w-full py-8', horizontalPad].join(' ')}>
      {children}
    </div>
  );
}
