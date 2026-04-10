import { tenantJobsSubrouteRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';

export type CareersSection = 'browse' | 'applications' | 'profile';

const navClass =
  'mt-5 flex w-full gap-1 rounded-xl border border-[#e8e6e3] bg-white p-1 shadow-sm shadow-[#121212]/[0.04]';
const tabActive = 'flex-1 rounded-lg bg-[#121212] py-2.5 text-center text-[13px] font-semibold text-[#faf9f6]';
const tabIdle =
  'flex-1 rounded-lg py-2.5 text-center text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]';

type Props = {
  orgSlug: string | null;
  hostHeader: string;
  current: CareersSection;
};

/**
 * Same tab bar as the public job index — keeps Open roles / Applications / Profile visually identical everywhere.
 */
export function CareersSectionNav({ orgSlug, hostHeader, current }: Props) {
  const o = orgSlug?.trim() ?? '';
  if (!o) return null;

  const browseHref = tenantPublicJobsIndexRelativePath(o, hostHeader);
  const applicationsHref = tenantJobsSubrouteRelativePath('me', o, hostHeader);
  const profileHref = tenantJobsSubrouteRelativePath('me/profile', o, hostHeader);

  return (
    <nav className={navClass} aria-label="Careers sections">
      {current === 'browse' ? (
        <span className={tabActive}>Open roles</span>
      ) : (
        <Link href={browseHref} className={tabIdle}>
          Open roles
        </Link>
      )}
      {current === 'applications' ? (
        <span className={tabActive}>Applications</span>
      ) : (
        <Link href={applicationsHref} className={tabIdle}>
          Applications
        </Link>
      )}
      {current === 'profile' ? (
        <span className={tabActive}>Profile</span>
      ) : (
        <Link href={profileHref} className={tabIdle}>
          Profile
        </Link>
      )}
    </nav>
  );
}
