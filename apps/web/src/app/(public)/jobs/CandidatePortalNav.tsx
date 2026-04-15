type Props = {
  orgSlug: string | null;
  hostHeader: string;
  current: 'applications' | 'profile';
};

/** @deprecated Navigation now renders inside CareersHeader. */
export function CandidatePortalNav(_props: Props) {
  return null;
}
