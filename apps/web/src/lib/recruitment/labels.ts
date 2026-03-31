import type {
  RecruitmentContractType,
  RecruitmentHireReason,
  RecruitmentRequestStatus,
  RecruitmentUrgency,
} from '@campsite/types';

const HIRE: Record<RecruitmentHireReason, string> = {
  new_role: 'New role',
  backfill: 'Backfill',
};

const CONTRACT: Record<RecruitmentContractType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  seasonal: 'Seasonal',
};

const STATUS: Record<RecruitmentRequestStatus, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  in_progress: 'In progress',
  filled: 'Filled',
  rejected: 'Rejected',
};

const URGENCY: Record<RecruitmentUrgency, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

export function recruitmentHireReasonLabel(v: string): string {
  return HIRE[v as RecruitmentHireReason] ?? v;
}

export function recruitmentContractLabel(v: string): string {
  return CONTRACT[v as RecruitmentContractType] ?? v;
}

export function recruitmentStatusLabel(v: string): string {
  return STATUS[v as RecruitmentRequestStatus] ?? v;
}

export function recruitmentUrgencyLabel(v: string): string {
  return URGENCY[v as RecruitmentUrgency] ?? v;
}
