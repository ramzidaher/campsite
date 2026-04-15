import { tenantJobsSubrouteRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';

export type CareersSection = 'browse' | 'applications' | 'profile';

const navClass = 'mt-5 flex w-full gap-1 rounded-xl border p-1 shadow-sm shadow-[#121212]/[0.04]';
const tabActive = 'flex-1 rounded-lg py-2.5 text-center text-[13px] font-semibold';
const tabIdle = 'flex-1 rounded-lg py-2.5 text-center text-[13px] font-medium transition-colors';

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
        borderColor: 'var(--org-brand-border, #e8e6e3)',
        background: 'var(--org-brand-bg, #ffffff)',
      }}
    >
      {current === 'browse' ? (
        <span className={tabActive} style={{ background: 'var(--org-brand-primary, #121212)', color: 'var(--jobs-on-primary, #faf9f6)' }}>Open roles</span>
      ) : (
        <Link href={browseHref} className={tabIdle} style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          Open roles
        </Link>
      )}
      {current === 'applications' ? (
        <span className={tabActive} style={{ background: 'var(--org-brand-primary, #121212)', color: 'var(--jobs-on-primary, #faf9f6)' }}>Applications</span>
      ) : (
        <Link href={applicationsHref} className={tabIdle} style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          Applications
        </Link>
      )}
      {current === 'profile' ? (
        <span className={tabActive} style={{ background: 'var(--org-brand-primary, #121212)', color: 'var(--jobs-on-primary, #faf9f6)' }}>Profile</span>
      ) : (
        <Link href={profileHref} className={tabIdle} style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          Profile
        </Link>
      )}
    </nav>
  );
}
