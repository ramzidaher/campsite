/**
 * Shared persona + skill options for the candidate portal.
 *
 * Used by both the registration card (`CandidateAuthCard`) and the candidate
 * profile editor (`/jobs/me/profile`) so values stay aligned across surfaces.
 */

export const CANDIDATE_SKILL_OPTIONS = [
  'React',
  'Python',
  'Design',
  'Leadership',
  'Data',
  'DevOps',
  'Marketing',
  'Sales',
  'Strategy',
  'Finance',
  'AI/ML',
  'Writing',
] as const;

export type CandidatePersonaOption = { emoji: string; label: string };

export const CANDIDATE_PERSONA_OPTIONS: readonly CandidatePersonaOption[] = [
  { emoji: '🚀', label: 'Rockstar' },
  { emoji: '🧙', label: 'Wizard' },
  { emoji: '🥷', label: 'Ninja' },
  { emoji: '🤖', label: 'Robot' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🦅', label: 'Phoenix' },
] as const;

export const CANDIDATE_SKILLS_MAX = 5;
