import { CareersSectionNav } from '@/app/(public)/jobs/CareersSectionNav';

type Props = {
  orgSlug: string | null;
  hostHeader: string;
  current: 'applications' | 'profile';
};

/** @deprecated Prefer importing {@link CareersSectionNav} — kept for call sites that only use portal routes. */
export function CandidatePortalNav(props: Props) {
  return <CareersSectionNav {...props} current={props.current} />;
}
