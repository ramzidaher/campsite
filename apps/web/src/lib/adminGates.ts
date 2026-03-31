import {
  isDepartmentWorkspaceRole,
  isManagerRole,
  isOrgAdminRole,
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
  | 'interviews';

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
    { href: '/admin/recruitment', label: 'Recruitment', icon: 'recruitment', section: 'Operations' },
    { href: '/admin/jobs', label: 'Job listings', icon: 'jobs', section: 'Operations' },
    { href: '/admin/applications', label: 'Applications', icon: 'applications', section: 'Operations' },
    { href: '/admin/offer-templates', label: 'Offer templates', icon: 'offerTemplates', section: 'Operations' },
    { href: '/admin/interviews', label: 'Interview schedule', icon: 'interviews', section: 'Operations' },
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
