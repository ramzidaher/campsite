import { isOrgAdminRole, type ProfileRole } from './roles';
import type { PermissionKey } from './permissions';

export const BROADCAST_STATUSES = [
  'draft',
  'pending_approval',
  'scheduled',
  'sent',
  'cancelled',
] as const;

export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export function canComposeBroadcast(role: ProfileRole | string | null | undefined): boolean {
  return (
    role === 'administrator' ||
    role === 'duty_manager' ||
    role === 'csa' ||
    role === 'coordinator' ||
    role === 'manager' ||
    isOrgAdminRole(role) ||
    role === 'society_leader'
  );
}

export function isBroadcastApproverRole(role: ProfileRole | string | null | undefined): boolean {
  return role === 'manager' || isOrgAdminRole(role);
}

/** Draft + submit-for-approval only (duty manager + CSA). Administrators send like managers (no approval required). */
export function isBroadcastDraftOnlyRole(role: ProfileRole | string | null | undefined): boolean {
  return role === 'duty_manager' || role === 'csa';
}

export function canComposeBroadcastByPermissions(
  permissions: readonly PermissionKey[] | null | undefined
): boolean {
  return Boolean(permissions?.includes('broadcasts.compose'));
}

export function canApproveBroadcastByPermissions(
  permissions: readonly PermissionKey[] | null | undefined
): boolean {
  return Boolean(permissions?.includes('broadcasts.approve'));
}
