import {
  isDepartmentWorkspaceRole,
  isManagerRole,
  PERMISSION_KEYS,
  type PermissionKey,
  type ProfileRole,
} from '@campsite/types';

function normalizedProfileRole(role: ProfileRole | string | null | undefined): string | null {
  if (role === null || role === undefined) return null;
  const s = String(role).trim();
  return s.length ? s : null;
}

/**
 * Deprecated role-based gate kept only for compatibility.
 * Authorization is permission-key driven and must not depend on role strings.
 */
export function canAccessOrgAdminArea(role: ProfileRole | string | null | undefined): boolean {
  void role;
  return false;
}

/**
 * Deprecated role-based sub-gates kept only for compatibility signatures.
 */
export function canManageOrgUsers(role: ProfileRole | string | null | undefined): boolean {
  void role;
  return false;
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  permission: (typeof PERMISSION_KEYS)[number]
): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(permission);
}

export function canManageOrgDepartments(role: ProfileRole | string | null | undefined): boolean {
  void role;
  return false;
}

export function canManageOrgBroadcastsAdmin(role: ProfileRole | string | null | undefined): boolean {
  void role;
  return false;
}

export function canManageOrgSettings(role: ProfileRole | string | null | undefined): boolean {
  void role;
  return false;
}

/**
 * Sidebar nav icons (Lucide, colored). Keys are mapped in `ShellNavIcon`.
 */
export type ShellNavIconId =
  | 'dashboard'
  | 'broadcasts'
  | 'calendar'
  | 'rota'
  | 'discount'
  | 'resources'
  | 'settings'
  | 'home'
  | 'members'
  | 'pending'
  | 'roles'
  | 'departments'
  | 'teams'
  | 'categories'
  | 'activity'
  | 'orgSettings'
  | 'notifications'
  | 'integrations'
  | 'manager'
  | 'managerSection'
  | 'hrSection'
  | 'adminSection'
  | 'oneOnOnes'
  | 'recruitment'
  | 'jobs'
  | 'applications'
  | 'offerTemplates'
  | 'interviews'
  | 'leave'
  | 'hrRecords'
  | 'userProfile'
  | 'onboarding'
  | 'performance'
  | 'orgChart'
  | 'systemOverview'
  | 'absenceReport'
  | 'attendance'
  | 'payroll'
  | 'privacy';

/** Main app sidebar: links under “Admin” / “Manager”; optional `section` renders a group heading like the reference admin nav. */
export type MainShellAdminNavItem = {
  href: string;
  label: string;
  icon: ShellNavIconId;
  badge?: number;
  /** e.g. broadcasts awaiting approval (shown beside unread-style badge). */
  secondaryBadge?: number;
  secondaryBadgeTitle?: string;
  section?: string;
  /** When true, only this path counts as active (e.g. `/manager` vs `/manager/teams`). */
  exact?: boolean;
  /** Optional visual nesting hint (used by HR recruitment sub-nav). */
  nested?: boolean;
};

export function getMainShellAdminNavItems(
  role: ProfileRole | string | null | undefined
): MainShellAdminNavItem[] | null {
  const r = normalizedProfileRole(role);
  if (!canAccessOrgAdminArea(r)) return null;
  return [
    { href: '/admin', label: 'Overview', icon: 'home' },
    { href: '/admin/users', label: 'All members', icon: 'members' },
    { href: '/admin/system-overview', label: 'System overview', icon: 'systemOverview' },
    { href: '/admin/pending', label: 'Pending approval', icon: 'pending' },
    { href: '/admin/roles', label: 'Roles & permissions', icon: 'roles' },
    { href: '/admin/broadcasts', label: 'Broadcasts', icon: 'broadcasts', section: 'Content' },
    { href: '/admin/departments', label: 'Departments', icon: 'departments', section: 'Content' },
    { href: '/admin/teams', label: 'Teams', icon: 'teams', section: 'Content' },
    { href: '/admin/categories', label: 'Categories', icon: 'categories', section: 'Content' },
    { href: '/admin/rota', label: 'Rota management', icon: 'rota', section: 'Operations' },
    { href: '/hr/hiring', label: 'Hiring', icon: 'recruitment', section: 'HR' },
    { href: '/hr/records', label: 'Employee records', icon: 'hrRecords', section: 'HR' },
    { href: '/hr/absence-reporting', label: 'Absence reporting', icon: 'absenceReport', section: 'HR' },
    { href: '/hr/org-chart', label: 'Org chart', icon: 'orgChart', section: 'HR' },
    { href: '/hr/onboarding', label: 'Onboarding', icon: 'onboarding', section: 'HR' },
    { href: '/hr/performance', label: 'Performance reviews', icon: 'performance', section: 'HR' },
    { href: '/hr/one-on-ones', label: '1:1 check-ins', icon: 'hrRecords', section: 'HR' },
    { href: '/admin/discount', label: 'Discount rules', icon: 'discount', section: 'Operations' },
    { href: '/admin/scan-logs', label: 'Activity log', icon: 'activity', section: 'Operations' },
    { href: '/admin/settings', label: 'Org settings', icon: 'orgSettings', section: 'Configuration' },
    { href: '/admin/notifications', label: 'Notification defaults', icon: 'notifications', section: 'Configuration' },
    { href: '/admin/integrations', label: 'Integrations', icon: 'integrations', section: 'Configuration' },
  ];
}

/** Sidebar heading for the collapsible manager / department workspace block. */
export function getMainShellManagerNavSectionLabel(
  role: ProfileRole | string | null | undefined
): string {
  const r = normalizedProfileRole(role);
  return r === 'coordinator' ? 'Department' : 'Manager';
}

/** Collapsible department workspace in the main shell (managers + coordinators; same pattern as Admin). */
export function getMainShellManagerNavItems(
  role: ProfileRole | string | null | undefined,
  opts: { pendingApprovalCount: number }
): MainShellAdminNavItem[] | null {
  const r = normalizedProfileRole(role);
  if (!isDepartmentWorkspaceRole(r)) return null;
  const { pendingApprovalCount } = opts;

  const pendingMembers: MainShellAdminNavItem = {
    href: '/pending-approvals',
    label: 'Pending members',
    icon: 'pending',
    badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined,
    section: 'People',
  };
  const recruitment: MainShellAdminNavItem = {
    href: '/hr/hiring',
    label: 'Hiring',
    icon: 'recruitment',
    section: 'People',
  };
  const departments: MainShellAdminNavItem = {
    href: '/manager/departments',
    label: 'Departments',
    icon: 'departments',
    section: 'Your departments',
  };
  const teams: MainShellAdminNavItem = {
    href: '/manager/teams',
    label: 'Teams',
    icon: 'teams',
    section: 'Your departments',
  };

  if (isManagerRole(r)) {
    return [
      { href: '/manager', label: 'Overview', icon: 'home', exact: true },
      pendingMembers,
      recruitment,
      departments,
      teams,
    ];
  }

  return [pendingMembers, recruitment, departments, teams];
}

export function getMainShellAdminNavItemsByPermissions(
  permissions: readonly string[] | null | undefined
): MainShellAdminNavItem[] | null {
  const p = permissions ?? [];
  const canSeeAnyAdmin = p.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('approvals.') ||
      k.startsWith('departments.') ||
      k.startsWith('teams.') ||
      k.startsWith('broadcasts.') ||
      k.startsWith('discounts.') ||
      k.startsWith('rota.')
  );
  if (!canSeeAnyAdmin) return null;

  const items: MainShellAdminNavItem[] = [{ href: '/admin', label: 'Overview', icon: 'home' }];
  if (p.includes('members.view')) items.push({ href: '/admin/users', label: 'All members', icon: 'members' });
  const canSeeSystemOverview = p.some(
    (k) =>
      k.startsWith('members.') ||
      k.startsWith('roles.') ||
      k.startsWith('approvals.') ||
      k.startsWith('departments.') ||
      k.startsWith('teams.') ||
      k.startsWith('broadcasts.') ||
      k.startsWith('discounts.') ||
      k.startsWith('rota.') ||
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.')
  );
  if (canSeeSystemOverview) {
    // Keep this after members to match the sidebar visual order.
    if (p.includes('members.view')) {
      items.push({ href: '/admin/system-overview', label: 'System overview', icon: 'systemOverview' });
    } else {
      items.splice(1, 0, { href: '/admin/system-overview', label: 'System overview', icon: 'systemOverview' });
    }
  }
  if (p.includes('approvals.members.review'))
    items.push({ href: '/admin/pending', label: 'Pending approval', icon: 'pending' });
  if (p.includes('roles.view')) items.push({ href: '/admin/roles', label: 'Roles & permissions', icon: 'roles' });
  if (p.includes('broadcasts.view'))
    items.push({ href: '/admin/broadcasts', label: 'Broadcasts', icon: 'broadcasts', section: 'Content' });
  if (p.includes('departments.view'))
    items.push({ href: '/admin/departments', label: 'Departments', icon: 'departments', section: 'Content' });
  if (p.includes('teams.view'))
    items.push({ href: '/admin/teams', label: 'Teams', icon: 'teams', section: 'Content' });
  items.push({ href: '/admin/categories', label: 'Categories', icon: 'categories', section: 'Content' });
  if (p.includes('rota.view') || p.includes('rota.manage'))
    items.push({ href: '/admin/rota', label: 'Rota management', icon: 'rota', section: 'Operations' });
  if (p.includes('discounts.view'))
    items.push({ href: '/admin/discount', label: 'Discount rules', icon: 'discount', section: 'Operations' });
  if (p.includes('members.view'))
    items.push({ href: '/admin/scan-logs', label: 'Activity log', icon: 'activity', section: 'Operations' });
  items.push({ href: '/admin/settings', label: 'Org settings', icon: 'orgSettings', section: 'Configuration' });
  if (
    p.includes('privacy.retention_policy.view') ||
    p.includes('privacy.erasure_request.review') ||
    p.includes('privacy.erasure_request.audit_view')
  ) {
    items.push({ href: '/admin/privacy', label: 'Privacy center', icon: 'privacy', section: 'Configuration' });
  }
  items.push({
    href: '/admin/notifications',
    label: 'Notification defaults',
    icon: 'notifications',
    section: 'Configuration',
  });
  items.push({ href: '/admin/integrations', label: 'Integrations', icon: 'integrations', section: 'Configuration' });
  return items;
}

export function getMainShellHrNavItemsByPermissions(
  permissions: readonly string[] | null | undefined
): MainShellAdminNavItem[] | null {
  const p = permissions ?? [];
  const canSeeAnyHr = p.some(
    (k) =>
      k.startsWith('recruitment.') ||
      k.startsWith('jobs.') ||
      k.startsWith('applications.') ||
      k.startsWith('offers.') ||
      k.startsWith('interviews.') ||
      k.startsWith('leave.') ||
      k.startsWith('hr.') ||
      k.startsWith('onboarding.') ||
      k.startsWith('performance.') ||
      k.startsWith('one_on_one.') ||
      k.startsWith('payroll.')
  );
  if (!canSeeAnyHr) return null;

  const items: MainShellAdminNavItem[] = [];
  /** No `section` → AppShell renders this row as the HR “overview” entry (icon + /hr home). */
  items.push({ href: '/hr', label: 'People overview', icon: 'home', exact: true });
  const canSeeRecruitment =
    p.includes('recruitment.view') || p.includes('recruitment.manage') || p.includes('recruitment.approve_request');
  const canSeeJobs = p.includes('jobs.view');
  const canSeeApplications = p.includes('applications.view');
  const canSeeOffers = p.includes('offers.view');
  const canSeeInterviews = p.includes('interviews.view') || p.includes('interviews.book_slot');
  const canSeeHiringHub =
    canSeeRecruitment ||
    canSeeJobs ||
    canSeeApplications ||
    canSeeOffers ||
    canSeeInterviews ||
    p.includes('recruitment.create_request');

  if (canSeeHiringHub) {
    items.push({ href: '/hr/hiring', label: 'Hiring', icon: 'recruitment', section: 'Recruitment' });
  }
  if (p.includes('leave.manage_org') && !p.includes('hr.view_records'))
    items.push({ href: '/hr/org-chart', label: 'Org chart', icon: 'orgChart', section: 'People' });
  if (p.includes('hr.view_records'))
    items.push({ href: '/hr/records', label: 'Employee records', icon: 'hrRecords', section: 'People' });
  else if (p.includes('hr.view_direct_reports'))
    items.push({ href: '/hr/records', label: 'Team records', icon: 'hrRecords', section: 'People' });
  if (p.includes('hr.view_records'))
    items.push({ href: '/hr/one-on-ones', label: '1:1 check-ins', icon: 'hrRecords', section: 'People' });
  if (p.includes('hr.view_records') || p.includes('leave.manage_org') || p.includes('hr.view_direct_reports')) {
    items.push({ href: '/hr/absence-reporting', label: 'Absence reporting', icon: 'absenceReport', section: 'Reporting' });
  }
  if (p.includes('hr.view_records')) {
    items.push({ href: '/hr/hr-metric-alerts', label: 'HR metric alerts', icon: 'notifications', section: 'Reporting' });
  }
  if (p.includes('hr.view_own'))
    items.push({ href: '/profile', label: 'My Profile', icon: 'userProfile', section: 'People' });
  if (p.includes('hr.view_records'))
    items.push({ href: '/hr/org-chart', label: 'Org chart', icon: 'orgChart', section: 'People' });
  if (
    p.includes('onboarding.manage_runs') ||
    p.includes('onboarding.manage_templates') ||
    p.includes('onboarding.complete_own_tasks')
  )
    items.push({ href: '/hr/onboarding', label: 'Onboarding', icon: 'onboarding', section: 'People' });
  if (p.includes('performance.manage_cycles') || p.includes('performance.view_reports'))
    items.push({ href: '/hr/performance', label: 'Performance reviews', icon: 'performance', section: 'Reporting' });
  if (p.includes('leave.view_own'))
    items.push({ href: '/attendance', label: 'Attendance', icon: 'attendance', section: 'Reporting' });
  if (p.includes('leave.approve_direct_reports') || p.includes('leave.manage_org'))
    items.push({ href: '/hr/timesheets', label: 'Timesheet review', icon: 'calendar', section: 'Payroll & time' });
  if (p.includes('payroll.view') || p.includes('payroll.manage'))
    items.push({ href: '/hr/finance', label: 'Finance', icon: 'dashboard', section: 'Payroll & time' });
  if (p.includes('payroll.view') || p.includes('payroll.manage'))
    items.push({ href: '/hr/wagesheets', label: 'Wagesheets', icon: 'payroll', section: 'Payroll & time' });
  if (
    p.includes('privacy.retention_policy.view') ||
    p.includes('privacy.erasure_request.review') ||
    p.includes('privacy.erasure_request.audit_view')
  ) {
    items.push({ href: '/admin/privacy', label: 'Privacy center', icon: 'privacy', section: 'Compliance' });
  }
  if (p.includes('hr.manage_records'))
    items.push({ href: '/hr/attendance-settings', label: 'Attendance sites', icon: 'orgSettings', section: 'Payroll & time' });
  return items.length ? items : null;
}

export function getMainShellManagerNavItemsByPermissions(
  permissions: readonly PermissionKey[] | null | undefined,
  opts: { pendingApprovalCount: number }
): MainShellAdminNavItem[] | null {
  const p = permissions ?? [];
  const { pendingApprovalCount } = opts;
  const items: MainShellAdminNavItem[] = [];
  const canManageWorkspace = p.includes('recruitment.create_request');
  const canViewDepts = p.includes('departments.view');
  const canViewTeams = p.includes('teams.view');
  const canReviewMembers = p.includes('approvals.members.review');
  if (!canManageWorkspace && !canViewDepts && !canViewTeams && !canReviewMembers) return null;

  if (canManageWorkspace) items.push({ href: '/manager', label: 'Overview', icon: 'home', exact: true });
  if (
    canManageWorkspace ||
    p.includes('recruitment.view') ||
    p.includes('recruitment.manage') ||
    p.includes('recruitment.approve_request') ||
    p.includes('hr.view_direct_reports')
  ) {
    items.push({ href: '/hr', label: 'People overview', icon: 'dashboard', exact: true });
  }
  if (canManageWorkspace || canViewDepts || canViewTeams || canReviewMembers) {
    items.push({
      href: '/manager/system-overview',
      label: 'System overview',
      icon: 'systemOverview',
      section: 'People',
    });
  }
  if (canReviewMembers) {
    items.push({
      href: '/pending-approvals',
      label: 'Pending members',
      icon: 'pending',
      badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined,
      section: 'People',
    });
  }
  if (
    p.includes('recruitment.view') ||
    p.includes('recruitment.manage') ||
    p.includes('recruitment.approve_request') ||
    p.includes('recruitment.create_request')
  )
    items.push({ href: '/hr/hiring', label: 'Hiring', icon: 'recruitment', section: 'People' });
  if (p.includes('hr.view_direct_reports'))
    items.push({ href: '/hr/records', label: 'Team HR records', icon: 'hrRecords', section: 'People' });
  if (canViewDepts)
    items.push({ href: '/manager/departments', label: 'Departments', icon: 'departments', section: 'Your departments' });
  if (canViewTeams)
    items.push({ href: '/manager/teams', label: 'Teams', icon: 'teams', section: 'Your departments' });
  return items;
}
