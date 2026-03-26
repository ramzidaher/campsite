/** Branded ID types — extend in later phases. */
export type OrganisationId = string & { readonly __brand: 'OrganisationId' };
export type UserId = string & { readonly __brand: 'UserId' };

export type OrgSlug = string & { readonly __brand: 'OrgSlug' };

export {
  PROFILE_ROLES,
  PROFILE_STATUSES,
  type ProfileRole,
  type ProfileStatus,
  isOrgAdminRole,
  isApproverRole,
  canVerifyStaffDiscountQr,
} from './roles';

export {
  BROADCAST_STATUSES,
  type BroadcastStatus,
  canComposeBroadcast,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from './broadcasts';
