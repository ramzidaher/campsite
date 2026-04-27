import type { JobApplicationMode, JobApplicationStage, JobListingStatus } from '@campsite/types';

const STATUS: Record<JobListingStatus, string> = {
  draft: 'Draft',
  live: 'Live',
  archived: 'Archived',
};

const MODE: Record<JobApplicationMode, string> = {
  cv: 'CV upload',
  loom: 'Loom video (1 min)',
  staffsavvy: 'StaffSavvy score',
  combination: 'Combination',
};

const APP_STAGE: Record<JobApplicationStage, string> = {
  applied: 'Applied',
  screened: 'Screened',
  assessed: 'Assessed',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  checks_cleared: 'Checks cleared',
  offer_approved: 'Offer approved',
  offer_sent: 'Offer sent',
  hired: 'Hired',
  rejected: 'Rejected',
};

export function jobListingStatusLabel(s: string): string {
  return STATUS[s as JobListingStatus] ?? s;
}

export function jobApplicationModeLabel(m: string): string {
  return MODE[m as JobApplicationMode] ?? m;
}

export function jobApplicationStageLabel(stage: string): string {
  return APP_STAGE[stage as JobApplicationStage] ?? stage;
}
