/** `org_admin` = organisation full admin (tenant). Platform founders use `platform_admins`, not this role. */
export const PROFILE_ROLES = [
  'org_admin',
  'manager',
  'coordinator',
  'administrator',
  'duty_manager',
  'csa',
  'society_leader',
] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const PROFILE_STATUSES = ['pending', 'active', 'inactive'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/**
 * Full tenant org admin. Includes legacy `super_admin` stored in DB until migration
 * `20260329120000_v2_profile_roles.sql` is applied (`super_admin` → `org_admin`).
 */
export function isOrgAdminRole(role: string | null | undefined): boolean {
  const r = role?.trim();
  return r === 'org_admin' || r === 'super_admin';
}

/** Member / broadcast approval queues: org admin, dept managers, coordinators (see RLS `can_approve_profile`). */
export function isApproverRole(role: string | null | undefined): boolean {
  return isOrgAdminRole(role) || role === 'manager' || role === 'coordinator';
}

/** Staff discount QR verification (scanner) — org admin, manager, duty manager. */
export function canVerifyStaffDiscountQr(role: string | null | undefined): boolean {
  return isOrgAdminRole(role) || role === 'manager' || role === 'duty_manager';
}
