export const JOB_LISTING_STATUSES = ['draft', 'live', 'archived'] as const;
export type JobListingStatus = (typeof JOB_LISTING_STATUSES)[number];

export const JOB_APPLICATION_MODES = ['cv', 'loom', 'staffsavvy', 'combination'] as const;
export type JobApplicationMode = (typeof JOB_APPLICATION_MODES)[number];

export function isJobListingStatus(s: string | null | undefined): s is JobListingStatus {
  return JOB_LISTING_STATUSES.includes(s as JobListingStatus);
}

export function isJobApplicationMode(s: string | null | undefined): s is JobApplicationMode {
  return JOB_APPLICATION_MODES.includes(s as JobApplicationMode);
}

export type JobApplicationBooleans = {
  allowCv: boolean;
  allowLoom: boolean;
  allowStaffsavvy: boolean;
  /** Combination mode: structured role questions count as an application channel (no CV required). */
  allowApplicationQuestions?: boolean;
};

/**
 * Normalises flags for persistence: single-mode rows store exactly one allow_* true.
 * Combination requires at least one channel.
 */
export function normaliseJobApplicationFlags(
  mode: JobApplicationMode,
  flags: JobApplicationBooleans
): {
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  allow_application_questions: boolean;
} {
  if (mode === 'combination') {
    return {
      allow_cv: flags.allowCv,
      allow_loom: flags.allowLoom,
      allow_staffsavvy: flags.allowStaffsavvy,
      allow_application_questions: Boolean(flags.allowApplicationQuestions),
    };
  }
  if (mode === 'cv') {
    return {
      allow_cv: true,
      allow_loom: false,
      allow_staffsavvy: false,
      allow_application_questions: false,
    };
  }
  if (mode === 'loom') {
    return {
      allow_cv: false,
      allow_loom: true,
      allow_staffsavvy: false,
      allow_application_questions: false,
    };
  }
  return {
    allow_cv: false,
    allow_loom: false,
    allow_staffsavvy: true,
    allow_application_questions: false,
  };
}

export function combinationModeHasChannel(flags: JobApplicationBooleans): boolean {
  return (
    flags.allowCv ||
    flags.allowLoom ||
    flags.allowStaffsavvy ||
    Boolean(flags.allowApplicationQuestions)
  );
}

export const SCREENING_QUESTION_TYPES = [
  'short_text',
  'paragraph',
  'single_choice',
  'yes_no',
  /** Display-only heading on apply forms; no answer field. */
  'section_title',
] as const;
export type ScreeningQuestionType = (typeof SCREENING_QUESTION_TYPES)[number];

export function isScreeningQuestionType(s: string | null | undefined): s is ScreeningQuestionType {
  return SCREENING_QUESTION_TYPES.includes(s as ScreeningQuestionType);
}

export type ScreeningQuestionOption = { id: string; label: string };
