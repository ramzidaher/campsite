export const JOB_APPLICATION_STAGES = [
  'applied',
  'shortlisted',
  'interview_scheduled',
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
  'shortlisted',
  'interview_scheduled',
  'offer_sent',
  'hired',
  'rejected',
];
