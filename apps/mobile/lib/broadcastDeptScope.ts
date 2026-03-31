import { isOrgAdminRole, type ProfileRole } from '@campsite/types';

export type DeptRow = {
  id: string;
  org_id: string;
  name: string;
  type: 'department' | 'society' | 'club';
  is_archived: boolean;
};

/** Departments the user may target when composing a broadcast (matches web `dept-scope.ts`). */
export function departmentsForBroadcast(
  role: ProfileRole,
  orgId: string,
  departments: DeptRow[],
  userDeptIds: Set<string>,
  managedDeptIds: Set<string>,
): DeptRow[] {
  const active = departments.filter((d) => d.org_id === orgId && !d.is_archived);
  if (isOrgAdminRole(role)) {
    return active;
  }
  switch (role) {
    case 'manager':
      return active.filter((d) => managedDeptIds.has(d.id));
    case 'coordinator':
    case 'administrator':
    case 'duty_manager':
    case 'csa':
      return active.filter((d) => userDeptIds.has(d.id));
    case 'society_leader':
      return active.filter((d) => userDeptIds.has(d.id) && (d.type === 'society' || d.type === 'club'));
    default:
      return [];
  }
}
