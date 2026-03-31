export const INTERVIEW_SLOT_STATUSES = ['available', 'booked', 'completed'] as const;
export type InterviewSlotStatus = (typeof INTERVIEW_SLOT_STATUSES)[number];

export function isInterviewSlotStatus(s: string | null | undefined): s is InterviewSlotStatus {
  return INTERVIEW_SLOT_STATUSES.includes(s as InterviewSlotStatus);
}
