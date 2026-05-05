import { HrOverviewSnapshotClient } from '@/components/hr/HrOverviewSnapshotClient';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCachedHrOverviewPageData } from '@/lib/hr/getCachedHrOverviewPageData';

export default async function HrOverviewPage() {
  const pageData = await getCachedHrOverviewPageData();
  if (pageData.kind === 'redirect') redirect(pageData.to);
  const todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date())
    .replace(',', '');

  return (
    <div className="font-sans text-[#121212]">
      <div className="mb-7 border-b border-[#d8d8d8] pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-4">
            <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">People</h1>
            <p className="text-[13.5px] text-[#6b6b6b]">{todayLabel}</p>
          </div>
          <nav aria-label="People sections" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="border-b border-[#121212] pb-1 text-[13px] font-medium uppercase tracking-[0.12em] text-[#121212]">
              Overview
            </span>
            <Link href="/hr/hiring" className="pb-1 text-[13px] uppercase tracking-[0.12em] text-[#6b6b6b] transition-colors hover:text-[#121212]">
              Hiring
            </Link>
            <Link href="/hr/records" className="pb-1 text-[13px] uppercase tracking-[0.12em] text-[#6b6b6b] transition-colors hover:text-[#121212]">
              Directory
            </Link>
            <Link href="/leave" className="pb-1 text-[13px] uppercase tracking-[0.12em] text-[#6b6b6b] transition-colors hover:text-[#121212]">
              Time off
            </Link>
          </nav>
        </div>
      </div>
      <HrOverviewSnapshotClient permissionKeys={pageData.permissionKeys} badges={pageData.badges} />
    </div>
  );
}
