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

/** Stored on new self-registrations until an approver picks a real role. */
export const PROFILE_REGISTRATION_ROLE = 'unassigned' as const;

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

/**
 * Roles an approver may assign when activating a pending member (excludes `unassigned`).
 * Managers/coordinators cannot assign `org_admin` or `manager` from the approval queue.
 */
export function rolesAssignableOnApprove(viewerRole: string | null | undefined): ProfileRole[] {
  const r = viewerRole?.trim();
  if (isOrgAdminRole(r)) {
    return [...PROFILE_ROLES];
  }
  return PROFILE_ROLES.filter((role) => role !== 'org_admin' && role !== 'manager');
}

/** Member / broadcast approval queues: org admin, dept managers, coordinators (see RLS `can_approve_profile`). */
export function isApproverRole(role: string | null | undefined): boolean {
  return isOrgAdminRole(role) || role === 'manager' || role === 'coordinator';
}

/** Department manager workspace (`/manager` layout + shell link). Not org admin. */
export function isManagerRole(role: string | null | undefined): boolean {
  return role?.trim() === 'manager';
}

/**
 * Staff discount QR verification (scanner) - org admin, manager, duty manager.
 * Edge Function allowlist: `supabase/functions/_shared/staff_discount_verifier_roles.ts`
 */
export function canVerifyStaffDiscountQr(role: string | null | undefined): boolean {
  return isOrgAdminRole(role) || role === 'manager' || role === 'duty_manager';
}
