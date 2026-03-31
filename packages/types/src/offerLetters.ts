export const OFFER_LETTER_STATUSES = ['sent', 'signed', 'declined'] as const;
/** Candidate / card-facing offer workflow status (stored on `job_applications.offer_letter_status`). */
export type OfferLetterWorkflowStatus = (typeof OFFER_LETTER_STATUSES)[number];

export const APPLICATION_OFFER_ROW_STATUSES = ['sent', 'signed', 'declined', 'superseded'] as const;
export type ApplicationOfferRowStatus = (typeof APPLICATION_OFFER_ROW_STATUSES)[number];

export function isOfferLetterWorkflowStatus(s: string | null | undefined): s is OfferLetterWorkflowStatus {
  return OFFER_LETTER_STATUSES.includes(s as OfferLetterWorkflowStatus);
}
