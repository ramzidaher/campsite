import { CANDIDATE_LINEAR_STAGES, candidateStageTimeline } from '@/lib/jobs/applicationStageTimeline';

describe('candidateStageTimeline', () => {
  it('returns rejected for terminal rejection', () => {
    expect(candidateStageTimeline('rejected')).toEqual({ kind: 'rejected' });
  });

  it('returns linear timeline with correct index for each pipeline stage', () => {
    const stages = ['applied', 'shortlisted', 'interview_scheduled', 'offer_sent', 'hired'] as const;
    stages.forEach((stage, i) => {
      const t = candidateStageTimeline(stage);
      expect(t.kind).toBe('linear');
      if (t.kind === 'linear') {
        expect(t.currentIndex).toBe(i);
        expect(t.stages).toEqual(CANDIDATE_LINEAR_STAGES);
      }
    });
  });

  it('returns unknown for unexpected stage strings', () => {
    expect(candidateStageTimeline('')).toEqual({ kind: 'unknown', stage: '' });
    expect(candidateStageTimeline('not_a_stage')).toEqual({ kind: 'unknown', stage: 'not_a_stage' });
  });
});
