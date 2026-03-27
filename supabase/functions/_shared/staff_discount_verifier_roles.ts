/**
 * Roles allowed to call staff-discount-verify (scanner).
 * Keep in sync with `canVerifyStaffDiscountQr` in `packages/types/src/roles.ts`
 * (`isOrgAdminRole` → org_admin + super_admin, plus manager, duty_manager).
 */
export const STAFF_DISCOUNT_VERIFIER_ROLES = [
  'manager',
  'org_admin',
  'super_admin',
  'duty_manager',
] as const;

export type StaffDiscountVerifierRole = (typeof STAFF_DISCOUNT_VERIFIER_ROLES)[number];

export function isStaffDiscountVerifierRole(role: string | null | undefined): boolean {
  const r = role?.trim();
  if (!r) return false;
  return (STAFF_DISCOUNT_VERIFIER_ROLES as readonly string[]).includes(r);
}
