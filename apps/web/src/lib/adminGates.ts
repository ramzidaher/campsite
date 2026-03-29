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

/** Main app sidebar: links under “Admin” (no nested routes); optional `section` renders a group heading like the reference admin nav. */
export type MainShellAdminNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  section?: string;
};

export function getMainShellAdminNavItems(
  role: ProfileRole | string | null | undefined
): MainShellAdminNavItem[] | null {
  const r = normalizedProfileRole(role);
  if (!canAccessOrgAdminArea(r)) return null;
  return [
    { href: '/admin', label: 'Overview', icon: '🏠' },
    { href: '/admin/users', label: 'All members', icon: '👥' },
    { href: '/admin/pending', label: 'Pending approval', icon: '⏳' },
    { href: '/admin/roles', label: 'Roles & permissions', icon: '🏅' },
    { href: '/admin/broadcasts', label: 'Broadcasts', icon: '📡', section: 'Content' },
    { href: '/admin/departments', label: 'Departments', icon: '🏢', section: 'Content' },
    { href: '/admin/teams', label: 'Teams', icon: '🧩', section: 'Content' },
    { href: '/admin/categories', label: 'Categories', icon: '🏷', section: 'Content' },
    { href: '/admin/rota', label: 'Rota management', icon: '🗓', section: 'Operations' },
    { href: '/admin/discount', label: 'Discount rules', icon: '🎫', section: 'Operations' },
    { href: '/admin/scan-logs', label: 'Activity log', icon: '📋', section: 'Operations' },
    { href: '/admin/settings', label: 'Org settings', icon: '🔧', section: 'Configuration' },
    { href: '/admin/notifications', label: 'Notification defaults', icon: '🔔', section: 'Configuration' },
    { href: '/admin/integrations', label: 'Integrations', icon: '🔗', section: 'Configuration' },
  ];
}
