import {
  isDepartmentWorkspaceRole,
  isManagerRole,
  isOrgAdminRole,
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
 * Organisation-scoped admin area (`/admin`). Only org admins get the full shell; see ROLE-MAPPING.md.
 */
export function canAccessOrgAdminArea(role: ProfileRole | string | null | undefined): boolean {
  return isOrgAdminRole(normalizedProfileRole(role));
}

/**
 * Sub-gates for `/admin/*` pages. Today each maps to `isOrgAdminRole`; split here (not ad hoc in pages)
 * if product later allows e.g. settings-only delegates without full org admin.
 */
export function canManageOrgUsers(role: ProfileRole | string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  permission: (typeof PERMISSION_KEYS)[number]
): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(permission);
}

export function canManageOrgDepartments(role: ProfileRole | string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

export function canManageOrgBroadcastsAdmin(role: ProfileRole | string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

export function canManageOrgSettings(role: ProfileRole | string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

/**
 * Sidebar nav icons (Lucide, monochrome). Keys are mapped in `ShellNavIcon`.
 */
export type ShellNavIconId =
  | 'dashboard'
  | 'broadcasts'
  | 'calendar'
  | 'rota'
  | 'discount'
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
  | 'recruitment'
  | 'jobs'
  | 'applications'
  | 'offerTemplates'
  | 'interviews'
  | 'leave'
  | 'hrRecords'
  | 'onboarding'
  | 'performance';

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
};

export function getMainShellAdminNavItems(
  role: ProfileRole | string | null | undefined
): MainShellAdminNavItem[] | null {
  const r = normalizedProfileRole(role);
  if (!canAccessOrgAdminArea(r)) return null;
  return [
    { href: '/admin', label: 'Overview', icon: 'home' },
    { href: '/admin/users', label: 'All members', icon: 'members' },
    { href: '/admin/pending', label: 'Pending approval', icon: 'pending' },
    { href: '/admin/roles', label: 'Roles & permissions', icon: 'roles' },
    { href: '/admin/broadcasts', label: 'Broadcasts', icon: 'broadcasts', section: 'Content' },
    { href: '/admin/departments', label: 'Departments', icon: 'departments', section: 'Content' },
    { href: '/admin/teams', label: 'Teams', icon: 'teams', section: 'Content' },
    { href: '/admin/categories', label: 'Categories', icon: 'categories', section: 'Content' },
    { href: '/admin/rota', label: 'Rota management', icon: 'rota', section: 'Operations' },
    { href: '/hr/recruitment', label: 'Recruitment', icon: 'recruitment', section: 'HR' },
    { href: '/hr/jobs', label: 'Job listings', icon: 'jobs', section: 'HR' },
    { href: '/hr/applications', label: 'Applications', icon: 'applications', section: 'HR' },
    { href: '/hr/offer-templates', label: 'Offer templates', icon: 'offerTemplates', section: 'HR' },
    { href: '/hr/interviews', label: 'Interview schedule', icon: 'interviews', section: 'HR' },
    { href: '/hr/records', label: 'Employee records', icon: 'hrRecords', section: 'HR' },
    { href: '/hr/onboarding', label: 'Onboarding', icon: 'onboarding', section: 'HR' },
    { href: '/hr/performance', label: 'Performance reviews', icon: 'performance', section: 'HR' },
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
  opts: { pendingApprovalCount: number; pendingBroadcastApprovals: number }
): MainShellAdminNavItem[] | null {
  const r = normalizedProfileRole(role);
  if (!isDepartmentWorkspaceRole(r)) return null;
  const { pendingApprovalCount, pendingBroadcastApprovals } = opts;

  const pendingMembers: MainShellAdminNavItem = {
    href: '/pending-approvals',
    label: 'Pending members',
    icon: 'pending',
    badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined,
    section: 'People',
  };
  const recruitment: MainShellAdminNavItem = {
    href: '/manager/recruitment',
    label: 'Recruitment requests',
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
  const subTeams: MainShellAdminNavItem = {
    href: '/manager/sub-teams',
    label: 'Sub-teams',
    icon: 'categories',
    section: 'Your departments',
  };
  const broadcasts: MainShellAdminNavItem = {
    href: '/broadcasts',
    label: 'Broadcasts',
    icon: 'broadcasts',
    section: 'Operations',
    secondaryBadge: pendingBroadcastApprovals > 0 ? pendingBroadcastApprovals : undefined,
    secondaryBadgeTitle: 'Broadcasts awaiting your approval',
  };
  const rota: MainShellAdminNavItem = {
    href: '/rota',
    label: 'Department rota',
    icon: 'rota',
    section: 'Operations',
  };

  if (isManagerRole(r)) {
    return [
      { href: '/manager', label: 'Overview', icon: 'home', exact: true },
      pendingMembers,
      recruitment,
      departments,
      teams,
      subTeams,
      broadcasts,
      rota,
    ];
  }

  return [pendingMembers, recruitment, departments, teams, broadcasts, rota];
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
      k.startsWith('performance.')
  );
  if (!canSeeAnyHr) return null;

  const items: MainShellAdminNavItem[] = [];
  if (p.includes('recruitment.view') || p.includes('recruitment.manage') || p.includes('recruitment.approve_request'))
    items.push({ href: '/hr/recruitment', label: 'Recruitment', icon: 'recruitment' });
  if (p.includes('jobs.view')) items.push({ href: '/hr/jobs', label: 'Job listings', icon: 'jobs' });
  if (p.includes('applications.view'))
    items.push({ href: '/hr/applications', label: 'Applications', icon: 'applications' });
  if (p.includes('offers.view'))
    items.push({ href: '/hr/offer-templates', label: 'Offer templates', icon: 'offerTemplates' });
  if (p.includes('interviews.view'))
    items.push({ href: '/hr/interviews', label: 'Interview schedule', icon: 'interviews' });
  if (p.includes('leave.manage_org'))
    items.push({ href: '/hr/leave', label: 'Leave & allowances', icon: 'leave' });
  if (p.includes('hr.view_records'))
    items.push({ href: '/hr/records', label: 'Employee records', icon: 'hrRecords' });
  if (p.includes('onboarding.manage_runs') || p.includes('onboarding.manage_templates'))
    items.push({ href: '/hr/onboarding', label: 'Onboarding', icon: 'onboarding' });
  if (p.includes('performance.manage_cycles') || p.includes('performance.view_reports'))
    items.push({ href: '/hr/performance', label: 'Performance reviews', icon: 'performance' });
  return items.length ? items : null;
}

export function getMainShellManagerNavItemsByPermissions(
  permissions: readonly PermissionKey[] | null | undefined,
  opts: { pendingApprovalCount: number; pendingBroadcastApprovals: number }
): MainShellAdminNavItem[] | null {
  const p = permissions ?? [];
  const { pendingApprovalCount, pendingBroadcastApprovals } = opts;
  const items: MainShellAdminNavItem[] = [];
  const canManageWorkspace = p.includes('recruitment.create_request');
  const canViewDepts = p.includes('departments.view');
  const canViewTeams = p.includes('teams.view');
  const canReviewMembers = p.includes('approvals.members.review');
  if (!canManageWorkspace && !canViewDepts && !canViewTeams && !canReviewMembers) return null;

  if (canManageWorkspace) items.push({ href: '/manager', label: 'Overview', icon: 'home', exact: true });
  if (canReviewMembers) {
    items.push({
      href: '/pending-approvals',
      label: 'Pending members',
      icon: 'pending',
      badge: pendingApprovalCount > 0 ? pendingApprovalCount : undefined,
      section: 'People',
    });
  }
  if (p.includes('recruitment.view') || p.includes('recruitment.manage') || p.includes('recruitment.approve_request'))
    items.push({ href: '/manager/recruitment', label: 'Recruitment requests', icon: 'recruitment', section: 'People' });
  if (canViewDepts)
    items.push({ href: '/manager/departments', label: 'Departments', icon: 'departments', section: 'Your departments' });
  if (canViewTeams)
    items.push({ href: '/manager/teams', label: 'Teams', icon: 'teams', section: 'Your departments' });
  if (canManageWorkspace)
    items.push({ href: '/manager/sub-teams', label: 'Sub-teams', icon: 'categories', section: 'Your departments' });
  items.push({
    href: '/broadcasts',
    label: 'Broadcasts',
    icon: 'broadcasts',
    section: 'Operations',
    secondaryBadge: pendingBroadcastApprovals > 0 ? pendingBroadcastApprovals : undefined,
    secondaryBadgeTitle: 'Broadcasts awaiting your approval',
  });
  items.push({ href: '/rota', label: 'Department rota', icon: 'rota', section: 'Operations' });
  return items;
}
