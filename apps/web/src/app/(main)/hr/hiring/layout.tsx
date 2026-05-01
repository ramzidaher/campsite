import { HiringHubProvider } from '@/app/(main)/hr/hiring/HiringHubContext';
import { HiringHubTabNav } from '@/app/(main)/hr/hiring/HiringHubTabNav';
import type { SectionNavItem } from '@campsite/ui/web';
import { shellBundleOrgId } from '@/lib/shell/shellBundleAccess';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { parseShellPermissionKeys } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { headers } from 'next/headers';

export default async function HiringWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const bundle = await getCachedMainShellLayoutBundle();
  const p = parseShellPermissionKeys(bundle);
  const pendingReview = parseShellBadgeCounts(bundle).recruitment_pending_review;
  const canCreateRequest = p.includes('recruitment.create_request');
  const canViewQueue = p.includes('recruitment.view') || p.includes('recruitment.approve_request') || p.includes('recruitment.manage');
  const orgId = shellBundleOrgId(bundle);
  const pathname = (await headers()).get('x-campsite-pathname') ?? '';
  const cleanPathname = pathname.split('?')[0] ?? pathname;
  const hideNewRequestCta = cleanPathname.startsWith('/hr/hiring/new-request');
  const hiringMainPages = new Set([
    '/hr/hiring',
    '/hr/hiring/requests',
    '/hr/hiring/jobs',
    '/hr/hiring/application-forms',
    '/hr/hiring/templates',
    '/hr/hiring/contract-templates',
    '/hr/hiring/new-request',
  ]);
  const isHiringSubpage =
    (cleanPathname.startsWith('/hr/hiring/') && !hiringMainPages.has(cleanPathname)) ||
    cleanPathname.startsWith('/hr/jobs/') ||
    cleanPathname.startsWith('/hr/recruitment/');
  const showOverview = canViewQueue && Boolean(orgId) && !hideNewRequestCta;

  let openCount = 0;
  let pendingCount = 0;
  let inProgressCount = 0;
  let filledCount = 0;

  if (showOverview && orgId) {
    const supabase = await createClient();
    const [openRes, pendingRes, inProgressRes, filledRes] = await Promise.all([
      supabase
        .from('recruitment_requests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('archived_at', null),
      supabase
        .from('recruitment_requests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'pending_review')
        .is('archived_at', null),
      supabase
        .from('recruitment_requests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'in_progress')
        .is('archived_at', null),
      supabase.from('recruitment_requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'filled'),
    ]);
    openCount = openRes.count ?? 0;
    pendingCount = pendingRes.count ?? 0;
    inProgressCount = inProgressRes.count ?? 0;
    filledCount = filledRes.count ?? 0;
  }

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
  if (p.includes('jobs.view') || p.includes('applications.view')) {
    items.push({ href: '/hr/hiring/application-forms', label: 'Application forms' });
  }
  if (p.includes('offers.view')) items.push({ href: '/hr/hiring/templates', label: 'Offer templates' });
  if (p.includes('offers.view')) items.push({ href: '/hr/hiring/contract-templates', label: 'Contract templates' });

  return (
    <HiringHubProvider>
      <div className="mb-6 font-sans text-[#121212]">
        {!isHiringSubpage ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Hiring workspace</h1>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {showOverview ? (
                <details className="relative">
                  <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-[#d8d8d8] bg-white text-[14px] font-semibold text-[#121212] transition-colors hover:bg-[#faf9f6]">
                    i
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-[18rem] rounded-xl border border-[#e8e8e8] bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Overview</p>
                    <div className="mt-2 space-y-1.5 text-[12px] text-[#5d5d5d]">
                      <p className="flex items-center justify-between">
                        <span>Open</span>
                        <span className="font-semibold text-[#121212]">{openCount}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>Pending review</span>
                        <span className="font-semibold text-[#121212]">{pendingCount}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>In progress</span>
                        <span className="font-semibold text-[#121212]">{inProgressCount}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>Filled</span>
                        <span className="font-semibold text-[#121212]">{filledCount}</span>
                      </p>
                    </div>
                  </div>
                </details>
              ) : null}
              {canCreateRequest && !hideNewRequestCta ? (
                <Link
                  href="/hr/hiring/new-request"
                  prefetch={false}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
                >
                  + New request
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
        {!isHiringSubpage ? <HiringHubTabNav items={items} /> : null}
        <div className={isHiringSubpage ? 'mt-0 min-w-0' : 'mt-2 min-w-0'}>{children}</div>
      </div>
    </HiringHubProvider>
  );
}
