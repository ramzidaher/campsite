import { isOrgAdminRole } from './roles';

/** Staff `/rota` - “Department” scope tab (managers, coordinators, org admins; query is RLS-scoped). */
export function canViewRotaDepartmentScope(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || r === 'coordinator' || isOrgAdminRole(r);
}

/** Staff `/rota` - “Full rota” tab (org-wide grid). Must stay org-admin-only in UI; RLS still enforces readable rows. */
export function canViewRotaFullOrgGrid(role: string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

/**
 * Create/update/delete shifts and rota definitions where RLS allows (org admin, coordinator, manager dept scope, rota owner).
 */
export function canEditRotaShifts(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || r === 'coordinator' || isOrgAdminRole(r);
}

/** Create a new rota (becomes owner); same gate as typical rota management entry points. */
export function canCreateRota(role: string | null | undefined): boolean {
  return canEditRotaShifts(role);
}

/** Final approval on swap / change requests (org-wide pool). */
export function canFinalApproveRotaRequests(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || r === 'duty_manager' || isOrgAdminRole(r);
}

/** Transfer rota ownership (org admin only in DB RPC). */
export function canTransferRotaOwnership(role: string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

/** Submit recurring weekly availability + per-date overrides (rota staffing). */
export function canSubmitStaffAvailability(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'csa' || r === 'administrator';
}
