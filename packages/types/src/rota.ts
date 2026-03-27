import { isOrgAdminRole } from './roles';

/** Staff `/rota` — “Department” scope tab (managers: managed depts; org admins: UI shows tab; query is RLS-scoped). */
export function canViewRotaDepartmentScope(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || isOrgAdminRole(r);
}

/** Staff `/rota` — “Full rota” tab (org-wide grid). Must stay org-admin-only in UI; RLS still enforces readable rows. */
export function canViewRotaFullOrgGrid(role: string | null | undefined): boolean {
  return isOrgAdminRole(role);
}

/**
 * Create/update/delete shifts in rota UIs where `rota_shifts` RLS allows (`can_manage_rota_for_dept` / org admin).
 * Align with manager + org admin branches in migrations.
 */
export function canEditRotaShifts(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'manager' || isOrgAdminRole(r);
}
