/** Branded ID types - extend in later phases. */
export type OrganisationId = string & { readonly __brand: 'OrganisationId' };
export type UserId = string & { readonly __brand: 'UserId' };

export type OrgSlug = string & { readonly __brand: 'OrgSlug' };

export {
  PROFILE_ROLES,
  PROFILE_REGISTRATION_ROLE,
  PROFILE_STATUSES,
  type ProfileRole,
  type ProfileStatus,
  isOrgAdminRole,
  isApproverRole,
  isManagerRole,
  isDepartmentWorkspaceRole,
  canVerifyStaffDiscountQr,
  rolesAssignableOnApprove,
} from './roles';

export {
  BROADCAST_STATUSES,
  type BroadcastStatus,
  canComposeBroadcast,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from './broadcasts';

export {
  canViewDashboardSentBroadcastKpi,
  canViewDashboardStatTiles,
  canViewDashboardUnreadBroadcastKpi,
  canViewOrgWideDashboardStats,
  dashboardAggregateScope,
  type DashboardAggregateScope,
} from './dashboard';

export { canManageCalendarManualEvents } from './calendar';

export {
  canCreateRota,
  canEditRotaShifts,
  canFinalApproveRotaRequests,
  canSubmitStaffAvailability,
  canTransferRotaOwnership,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
} from './rota';

export { PLATFORM_ADMIN_MEMBERSHIP_TABLE } from './platform';
