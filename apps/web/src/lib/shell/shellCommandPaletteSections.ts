import type { MainShellAdminNavItem } from '@/lib/adminGates';

export type ShellCommandPaletteItem = {
  id: string;
  label: string;
  href: string;
  keywords?: string[];
};

export type ShellCommandPaletteSection = {
  id: string;
  heading: string;
  items: ShellCommandPaletteItem[];
};

function adminItemsToPalette(
  prefix: string,
  items: MainShellAdminNavItem[],
  extraKeywords: string[],
  orgName: string,
): ShellCommandPaletteItem[] {
  return items.map((it, i) => ({
    id: `${prefix}-${i}-${it.href}`,
    label: it.label,
    href: it.href,
    keywords: [...extraKeywords, it.section ?? '', orgName].filter(Boolean),
  }));
}

/**
 * Navigation + quick actions for the shell command menu (⌘K).
 * Mirrors primary sidebar visibility — keep in sync with `AppShell` nav.
 */
export function buildShellCommandPaletteSections(opts: {
  orgName: string;
  showMyHrRecordNav: boolean;
  showLeaveNav: boolean;
  showAttendanceNav: boolean;
  showPerformanceNav: boolean;
  showOneOnOneNav: boolean;
  showOnboardingNav: boolean;
  /** `/pending-approvals` when the user is an approver but has no Admin/Manager hub. */
  showApprovalsStandalone: boolean;
  managerNavSectionLabel: string;
  managerNavItems: MainShellAdminNavItem[] | null;
  financeNavItems: MainShellAdminNavItem[] | null;
  hrNavItems: MainShellAdminNavItem[] | null;
  adminNavItems: MainShellAdminNavItem[] | null;
}): ShellCommandPaletteSection[] {
  const sections: ShellCommandPaletteSection[] = [];

  sections.push({
    id: 'actions',
    heading: 'Actions',
    items: [
      {
        id: 'action-compose-broadcast',
        label: 'Compose a broadcast',
        href: '/broadcasts?tab=feed&compose=1',
        keywords: ['new', 'write', 'message', 'announce', 'post'],
      },
    ],
  });

  const main: ShellCommandPaletteItem[] = [
    { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', keywords: ['home', 'overview'] },
  ];
  if (opts.showMyHrRecordNav) {
    main.push({
      id: 'nav-profile',
      label: 'My profile',
      href: '/profile',
      keywords: ['account', 'hr', 'me', 'details'],
    });
  }
  main.push(
    { id: 'nav-broadcasts', label: 'Broadcasts', href: '/broadcasts', keywords: ['news', 'updates', 'messages'] },
    { id: 'nav-calendar', label: 'Calendar', href: '/calendar', keywords: ['events', 'schedule'] },
    { id: 'nav-rota', label: 'Rota', href: '/rota', keywords: ['schedule', 'shifts', 'swaps'] },
    { id: 'nav-discount', label: 'Discount Card', href: '/discount', keywords: ['perks', 'benefits'] },
  );
  if (opts.showLeaveNav) {
    main.push({ id: 'nav-leave', label: 'Leave', href: '/leave', keywords: ['time off', 'pto', 'holiday', 'absence'] });
  }
  if (opts.showAttendanceNav) {
    main.push({
      id: 'nav-attendance',
      label: 'Attendance',
      href: '/attendance',
      keywords: ['clock in', 'clock out', 'timesheet', 'hours'],
    });
  }
  if (opts.showPerformanceNav) {
    main.push({
      id: 'nav-performance',
      label: 'Performance',
      href: '/performance',
      keywords: ['reviews', 'assessment'],
    });
  }
  if (opts.showOneOnOneNav) {
    main.push({
      id: 'nav-one-on-ones',
      label: '1:1 check-ins',
      href: '/one-on-ones',
      keywords: ['check-in', 'meetings', 'one on one'],
    });
  }
  main.push({
    id: 'nav-resources',
    label: 'Resource library',
    href: '/resources',
    keywords: ['files', 'documents', 'handbook', 'library'],
  });
  if (opts.showOnboardingNav) {
    main.push({
      id: 'nav-onboarding',
      label: 'Onboarding',
      href: '/onboarding',
      keywords: ['new hire', 'starter'],
    });
  }
  if (opts.showApprovalsStandalone) {
    main.push({
      id: 'nav-approvals',
      label: 'Approvals',
      href: '/pending-approvals',
      keywords: ['pending', 'review', 'queue'],
    });
  }

  sections.push({ id: 'navigate', heading: 'Navigate', items: main });

  sections.push({
    id: 'notifications',
    heading: 'Notifications',
    items: [
      {
        id: 'notif-leave',
        label: 'Time off notifications',
        href: '/notifications/leave',
        keywords: ['leave', 'pto', 'absence', 'alerts'],
      },
      {
        id: 'notif-calendar',
        label: 'Calendar notifications',
        href: '/notifications/calendar',
        keywords: ['events', 'schedule', 'alerts'],
      },
      {
        id: 'notif-recruitment',
        label: 'Recruitment notifications',
        href: '/notifications/recruitment',
        keywords: ['hiring', 'jobs', 'alerts'],
      },
      {
        id: 'notif-applications',
        label: 'Application notifications',
        href: '/notifications/applications',
        keywords: ['candidates', 'applicants', 'alerts'],
      },
      {
        id: 'notif-hr-metrics',
        label: 'HR metric alerts',
        href: '/notifications/hr-metrics',
        keywords: ['metrics', 'people', 'alerts'],
      },
    ],
  });

  sections.push({
    id: 'careers',
    heading: 'Careers',
    items: [
      {
        id: 'careers-open-roles',
        label: 'Open roles (public careers)',
        href: '/jobs',
        keywords: ['careers', 'vacancies', 'external', 'public'],
      },
    ],
  });

  if (opts.managerNavItems?.length) {
    sections.push({
      id: 'manager',
      heading: opts.managerNavSectionLabel,
      items: adminItemsToPalette('mgr', opts.managerNavItems, ['manager'], opts.orgName),
    });
  }
  if (opts.hrNavItems?.length) {
    sections.push({
      id: 'hr',
      heading: 'HR',
      items: adminItemsToPalette('hr', opts.hrNavItems, ['hr', 'people'], opts.orgName),
    });
  }
  if (opts.financeNavItems?.length) {
    sections.push({
      id: 'finance',
      heading: 'Finance',
      items: adminItemsToPalette('fin', opts.financeNavItems, ['finance', 'payroll', 'wagesheets'], opts.orgName),
    });
  }
  if (opts.adminNavItems?.length) {
    sections.push({
      id: 'admin',
      heading: 'Admin',
      items: adminItemsToPalette('adm', opts.adminNavItems, ['admin', 'organisation'], opts.orgName),
    });
  }

  sections.push({
    id: 'account',
    heading: 'Account',
    items: [
      {
        id: 'nav-settings',
        label: 'Settings',
        href: '/settings',
        keywords: ['preferences', 'profile', 'account'],
      },
    ],
  });

  return sections;
}
