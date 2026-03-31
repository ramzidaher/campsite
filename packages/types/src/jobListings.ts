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
};

/**
 * Normalises flags for persistence: single-mode rows store exactly one allow_* true.
 * Combination requires at least one channel.
 */
export function normaliseJobApplicationFlags(
  mode: JobApplicationMode,
  flags: JobApplicationBooleans
): { allow_cv: boolean; allow_loom: boolean; allow_staffsavvy: boolean } {
  if (mode === 'combination') {
    return {
      allow_cv: flags.allowCv,
      allow_loom: flags.allowLoom,
      allow_staffsavvy: flags.allowStaffsavvy,
    };
  }
  if (mode === 'cv') {
    return { allow_cv: true, allow_loom: false, allow_staffsavvy: false };
  }
  if (mode === 'loom') {
    return { allow_cv: false, allow_loom: true, allow_staffsavvy: false };
  }
  return { allow_cv: false, allow_loom: false, allow_staffsavvy: true };
}

export function combinationModeHasChannel(flags: JobApplicationBooleans): boolean {
  return flags.allowCv || flags.allowLoom || flags.allowStaffsavvy;
}
