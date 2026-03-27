import { isOrgAdminRole } from './roles';

/** How dashboard KPI tiles (broadcasts sent, active members) are scoped for the viewer. */
export type DashboardAggregateScope = 'none' | 'org' | 'dept';

/**
 * - `org` — full-organisation totals (org admin).
 * - `dept` — union of departments the user is in and, for managers, departments they manage (coordinator, manager, society_leader).
 * - `none` — no KPI tiles (administrator, duty_manager, csa).
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

/** @deprecated Use dashboardAggregateScope(role) === 'org' — managers/coordinators use dept scope. */
export function canViewOrgWideDashboardStats(role: string | null | undefined): boolean {
  return dashboardAggregateScope(role) === 'org';
}
