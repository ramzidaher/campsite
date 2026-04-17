import { HiringHubProvider } from '@/app/(main)/hr/hiring/HiringHubContext';
import { HiringHubTabNav } from '@/app/(main)/hr/hiring/HiringHubTabNav';
import type { SectionNavItem } from '@campsite/ui/web';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { parseShellPermissionKeys } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import Link from 'next/link';
import { headers } from 'next/headers';

export default async function HiringWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const bundle = await getCachedMainShellLayoutBundle();
  const p = parseShellPermissionKeys(bundle);
  const pendingReview = parseShellBadgeCounts(bundle).recruitment_pending_review;
  const canCreateRequest = p.includes('recruitment.create_request');
  const pathname = (await headers()).get('x-campsite-pathname') ?? '';
  const hideNewRequestCta = pathname.startsWith('/hr/hiring/new-request');

  const items: SectionNavItem[] = [];
  if (
    p.includes('recruitment.view') ||
    p.includes('recruitment.manage') ||
    p.includes('recruitment.approve_request') ||
    p.includes('recruitment.create_request')
  ) {
    items.push({
      href: '/hr/hiring/requests',
      label: 'Hiring requests',
      badge: pendingReview > 0 ? pendingReview : undefined,
    });
  }
  if (p.includes('jobs.view')) items.push({ href: '/hr/hiring/jobs', label: 'Job listings' });
  if (p.includes('applications.view')) items.push({ href: '/hr/hiring/applications', label: 'Applicants' });
  if (p.includes('interviews.view') || p.includes('interviews.book_slot')) {
    items.push({ href: '/hr/hiring/interviews', label: 'Interview schedule' });
  }
  if (p.includes('offers.view')) items.push({ href: '/hr/hiring/templates', label: 'Offer templates' });

  return (
    <HiringHubProvider>
      <div className="mb-6 font-sans text-[#121212]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Hiring workspace</h1>
          {canCreateRequest && !hideNewRequestCta ? (
            <Link
              href="/hr/hiring/new-request"
              prefetch={false}
              className="inline-flex h-9 shrink-0 items-center justify-center self-start rounded-full border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6] sm:self-auto"
            >
              + New request
            </Link>
          ) : null}
        </div>
        <HiringHubTabNav items={items} />
        <div className="mt-6 min-w-0">{children}</div>
      </div>
    </HiringHubProvider>
  );
}
