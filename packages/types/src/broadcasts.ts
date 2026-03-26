import { isOrgAdminRole, type ProfileRole } from './roles';

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

/** Draft + submit-for-approval only (v2 baseline for administrator / duty manager / CSA). */
export function isBroadcastDraftOnlyRole(role: ProfileRole | string | null | undefined): boolean {
  return role === 'administrator' || role === 'duty_manager' || role === 'csa';
}
