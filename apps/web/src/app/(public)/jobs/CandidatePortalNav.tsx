import { tenantJobsSubrouteRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';

type Props = {
  orgSlug: string | null;
  hostHeader: string;
  current: 'applications' | 'profile';
};

export function CandidatePortalNav({ orgSlug, hostHeader, current }: Props) {
  const o = orgSlug?.trim() ?? '';
  if (!o) return null;

  const browseHref = tenantPublicJobsIndexRelativePath(o, hostHeader);
  const applicationsHref = tenantJobsSubrouteRelativePath('me', o, hostHeader);
  const profileHref = tenantJobsSubrouteRelativePath('me/profile', o, hostHeader);

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={
        active
          ? 'rounded-lg bg-[#121212] px-3 py-1.5 text-[13px] font-medium text-white'
          : 'rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[13px] text-[#505050] hover:bg-[#f5f4f1]'
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-[#ececec] bg-white px-1 pb-4">
      {tab(browseHref, 'Open roles', false)}
      {tab(applicationsHref, 'My applications', current === 'applications')}
      {tab(profileHref, 'Profile', current === 'profile')}
    </nav>
  );
}
