export const JOB_APPLICATION_STAGES = [
  'applied',
  'screened',
  'assessed',
  'shortlisted',
  'interview_scheduled',
  'checks_cleared',
  'offer_approved',
  'offer_sent',
  'hired',
  'rejected',
] as const;

export type JobApplicationStage = (typeof JOB_APPLICATION_STAGES)[number];

export function isJobApplicationStage(s: string | null | undefined): s is JobApplicationStage {
  return JOB_APPLICATION_STAGES.includes(s as JobApplicationStage);
}

/** Kanban column order (left → right). */
export const JOB_APPLICATION_STAGE_ORDER: readonly JobApplicationStage[] = [
  'applied',
  'screened',
  'assessed',
  'shortlisted',
  'interview_scheduled',
  'checks_cleared',
  'offer_approved',
  'offer_sent',
  'hired',
  'rejected',
];
