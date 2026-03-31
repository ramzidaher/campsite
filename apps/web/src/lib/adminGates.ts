import { isOrgAdminRole, type ProfileRole } from '@campsite/types';

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
  | 'manager';

/** Main app sidebar: links under “Admin” (no nested routes); optional `section` renders a group heading like the reference admin nav. */
export type MainShellAdminNavItem = {
  href: string;
  label: string;
  icon: ShellNavIconId;
  badge?: number;
  section?: string;
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
    { href: '/admin/discount', label: 'Discount rules', icon: 'discount', section: 'Operations' },
    { href: '/admin/scan-logs', label: 'Activity log', icon: 'activity', section: 'Operations' },
    { href: '/admin/settings', label: 'Org settings', icon: 'orgSettings', section: 'Configuration' },
    { href: '/admin/notifications', label: 'Notification defaults', icon: 'notifications', section: 'Configuration' },
    { href: '/admin/integrations', label: 'Integrations', icon: 'integrations', section: 'Configuration' },
  ];
}
