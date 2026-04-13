/** Branded ID types - extend in later phases. */
export type OrganisationId = string & { readonly __brand: 'OrganisationId' };
export type UserId = string & { readonly __brand: 'UserId' };

export type OrgSlug = string & { readonly __brand: 'OrgSlug' };

export {
  PERMISSION_KEYS,
  FOUNDER_ONLY_PERMISSION_KEYS,
  type PermissionKey,
  type FounderOnlyPermissionKey,
  type EffectivePermissionKey,
  type PermissionCondition,
} from './permissions';

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
  canComposeBroadcastByPermissions,
  canApproveBroadcastByPermissions,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from './broadcasts';

export {
  canViewDashboardSentBroadcastKpi,
  canViewDashboardStatTiles,
  canViewDashboardUnreadBroadcastKpi,
  canViewDashboardByPermissions,
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
  canManageRotaByPermissions,
  canTransferRotaOwnership,
  canViewRotaDepartmentScope,
  canViewRotaFullOrgGrid,
} from './rota';

export { PLATFORM_ADMIN_MEMBERSHIP_TABLE } from './platform';

export {
  RECRUITMENT_CONTRACT_TYPES,
  RECRUITMENT_HIRE_REASONS,
  RECRUITMENT_REQUEST_STATUSES,
  RECRUITMENT_URGENCY_LEVELS,
  type RecruitmentContractType,
  type RecruitmentHireReason,
  type RecruitmentRequestStatus,
  type RecruitmentUrgency,
  isRecruitmentContractType,
  isRecruitmentHireReason,
  isRecruitmentRequestStatus,
  isRecruitmentUrgency,
} from './recruitment';

export {
  JOB_APPLICATION_MODES,
  JOB_LISTING_STATUSES,
  type JobApplicationBooleans,
  type JobApplicationMode,
  type JobListingStatus,
  combinationModeHasChannel,
  isJobApplicationMode,
  isJobListingStatus,
  normaliseJobApplicationFlags,
} from './jobListings';

export {
  JOB_APPLICATION_STAGES,
  JOB_APPLICATION_STAGE_ORDER,
  type JobApplicationStage,
  isJobApplicationStage,
} from './jobApplications';

export {
  INTERVIEW_SLOT_STATUSES,
  type InterviewSlotStatus,
  isInterviewSlotStatus,
} from './interviewSlots';

export {
  OFFER_LETTER_STATUSES,
  APPLICATION_OFFER_ROW_STATUSES,
  type OfferLetterWorkflowStatus,
  type ApplicationOfferRowStatus,
  isOfferLetterWorkflowStatus,
} from './offerLetters';

export { UI_SOUND_EVENTS, type UiSoundEvent, type UiSoundPreset, type UiSoundToneSpec } from './uiSounds';

export { userFacingScoutError } from './scoutUserFacingError';
