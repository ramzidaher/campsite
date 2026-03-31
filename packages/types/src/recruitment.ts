export const RECRUITMENT_HIRE_REASONS = ['new_role', 'backfill'] as const;
export type RecruitmentHireReason = (typeof RECRUITMENT_HIRE_REASONS)[number];

export const RECRUITMENT_CONTRACT_TYPES = ['full_time', 'part_time', 'seasonal'] as const;
export type RecruitmentContractType = (typeof RECRUITMENT_CONTRACT_TYPES)[number];

export const RECRUITMENT_REQUEST_STATUSES = [
  'pending_review',
  'approved',
  'in_progress',
  'filled',
  'rejected',
] as const;
export type RecruitmentRequestStatus = (typeof RECRUITMENT_REQUEST_STATUSES)[number];

export const RECRUITMENT_URGENCY_LEVELS = ['low', 'normal', 'high'] as const;
export type RecruitmentUrgency = (typeof RECRUITMENT_URGENCY_LEVELS)[number];

export function isRecruitmentRequestStatus(s: string | null | undefined): s is RecruitmentRequestStatus {
  return RECRUITMENT_REQUEST_STATUSES.includes(s as RecruitmentRequestStatus);
}

export function isRecruitmentHireReason(s: string | null | undefined): s is RecruitmentHireReason {
  return RECRUITMENT_HIRE_REASONS.includes(s as RecruitmentHireReason);
}

export function isRecruitmentContractType(s: string | null | undefined): s is RecruitmentContractType {
  return RECRUITMENT_CONTRACT_TYPES.includes(s as RecruitmentContractType);
}

export function isRecruitmentUrgency(s: string | null | undefined): s is RecruitmentUrgency {
  return RECRUITMENT_URGENCY_LEVELS.includes(s as RecruitmentUrgency);
}
