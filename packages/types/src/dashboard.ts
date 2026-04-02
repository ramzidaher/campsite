import { isOrgAdminRole } from './roles';
import type { PermissionKey } from './permissions';

/** How dashboard KPI tiles (broadcasts sent, active members) are scoped for the viewer. */
export type DashboardAggregateScope = 'none' | 'org' | 'dept';

/**
 * - `org` - full-organisation totals (org admin).
 * - `dept` - union of departments the user is in and, for managers, departments they manage (coordinator, manager, society_leader).
 * - `none` - no KPI tiles (administrator, duty_manager, csa).
 */
export function dashboardAggregateScope(role: string | null | undefined): DashboardAggregateScope {
  const r = role?.trim();
  if (!r) return 'none';
  if (isOrgAdminRole(r)) return 'org';
  if (r === 'manager' || r === 'coordinator' || r === 'society_leader') return 'dept';
  return 'none';
}

export function canViewDashboardStatTiles(role: string | null | undefined): boolean {
  return dashboardAggregateScope(role) !== 'none';
}

/**
 * "Total broadcasts sent" KPI on home dashboard. Society leaders keep member totals but must not
 * see aggregate sent-broadcast counts.
 */
export function canViewDashboardSentBroadcastKpi(role: string | null | undefined): boolean {
  return canViewDashboardStatTiles(role) && role?.trim() !== 'society_leader';
}

/** Unread-broadcast count tile on home dashboard (non-approver layout). Hidden for society leaders. */
export function canViewDashboardUnreadBroadcastKpi(role: string | null | undefined): boolean {
  return role?.trim() !== 'society_leader';
}

/** @deprecated Use dashboardAggregateScope(role) === 'org' - managers/coordinators use dept scope. */
export function canViewOrgWideDashboardStats(role: string | null | undefined): boolean {
  return dashboardAggregateScope(role) === 'org';
}

export function canViewDashboardByPermissions(
  permissions: readonly PermissionKey[] | null | undefined
): boolean {
  return Boolean(permissions?.includes('members.view') || permissions?.includes('broadcasts.compose'));
}
