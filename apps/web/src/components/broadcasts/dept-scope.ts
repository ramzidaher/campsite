import { isOrgAdminRole, type PermissionKey, type ProfileRole } from '@campsite/types';

export type DeptRow = {
  id: string;
  org_id: string;
  name: string;
  type: 'department' | 'society' | 'club';
  color_hex?: string | null;
  is_archived: boolean;
};

/** Departments the user may target when composing a broadcast (matches SQL RLS intent). */
export function departmentsForBroadcast(
  roleOrPermissions: ProfileRole | readonly PermissionKey[] | null | undefined,
  orgId: string,
  departments: DeptRow[],
  userDeptIds: Set<string>,
  managedDeptIds: Set<string>
): DeptRow[] {
  const active = departments.filter((d) => d.org_id === orgId && !d.is_archived);
  if (Array.isArray(roleOrPermissions)) {
    if (roleOrPermissions.includes('broadcasts.publish_without_approval')) return active;
  } else if (typeof roleOrPermissions === 'string' && isOrgAdminRole(roleOrPermissions)) {
    return active;
  }
  if (managedDeptIds.size > 0) return active.filter((d) => managedDeptIds.has(d.id));
  return active.filter((d) => userDeptIds.has(d.id));
}
