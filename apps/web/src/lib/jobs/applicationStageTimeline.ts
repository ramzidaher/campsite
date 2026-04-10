import type { JobApplicationStage } from '@campsite/types';

/** Stages shown left-to-right for in-progress applications (excludes terminal rejected). */
export const CANDIDATE_LINEAR_STAGES: readonly JobApplicationStage[] = [
  'applied',
  'shortlisted',
  'interview_scheduled',
  'offer_sent',
  'hired',
];

export type CandidateStageTimeline =
  | { kind: 'rejected' }
  | { kind: 'linear'; currentIndex: number; stages: readonly JobApplicationStage[] }
  | { kind: 'unknown'; stage: string };

export function candidateStageTimeline(stage: string): CandidateStageTimeline {
  if (stage === 'rejected') {
    return { kind: 'rejected' };
  }
  const idx = CANDIDATE_LINEAR_STAGES.indexOf(stage as JobApplicationStage);
  if (idx === -1) {
    return { kind: 'unknown', stage };
  }
  return { kind: 'linear', currentIndex: idx, stages: CANDIDATE_LINEAR_STAGES };
}
