import { tenantJobsSubrouteRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';

export type CareersSection = 'browse' | 'applications' | 'profile';

const navClass = 'mt-0 flex w-full gap-0 rounded-b-2xl border border-t-0 px-2 pb-2 pt-1.5';
const tabActive = 'flex-1 rounded-md py-2.5 text-center text-[13px] font-semibold';
const tabIdle = 'flex-1 rounded-md py-2.5 text-center text-[13px] font-medium transition-colors';

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
    <nav
      className={navClass}
      aria-label="Careers sections"
      style={{
        borderColor: 'color-mix(in oklab, var(--org-brand-primary, #121212) 45%, black 55%)',
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--org-brand-secondary, #2f2f2f) 92%, black 8%), color-mix(in oklab, var(--org-brand-secondary, #2f2f2f) 84%, black 16%))',
      }}
    >
      {current === 'browse' ? (
        <span
          className={tabActive}
          style={{
            background: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 85%, white 15%)',
            color: 'var(--org-brand-primary, #121212)',
          }}
        >
          Open roles
        </span>
      ) : (
        <Link
          href={browseHref}
          className={tabIdle}
          style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 76%, transparent)' }}
        >
          Open roles
        </Link>
      )}
      {current === 'applications' ? (
        <span
          className={tabActive}
          style={{
            background: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 85%, white 15%)',
            color: 'var(--org-brand-primary, #121212)',
          }}
        >
          Applications
        </span>
      ) : (
        <Link
          href={applicationsHref}
          className={tabIdle}
          style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 76%, transparent)' }}
        >
          Applications
        </Link>
      )}
      {current === 'profile' ? (
        <span
          className={tabActive}
          style={{
            background: 'color-mix(in oklab, var(--org-brand-accent, #d4af37) 85%, white 15%)',
            color: 'var(--org-brand-primary, #121212)',
          }}
        >
          Profile
        </span>
      ) : (
        <Link
          href={profileHref}
          className={tabIdle}
          style={{ color: 'color-mix(in oklab, var(--jobs-on-primary, #faf9f6) 76%, transparent)' }}
        >
          Profile
        </Link>
      )}
    </nav>
  );
}
