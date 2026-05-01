import { HrOverviewSnapshotClient } from '@/components/hr/HrOverviewSnapshotClient';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCachedHrOverviewPageData } from '@/lib/hr/getCachedHrOverviewPageData';

export default async function HrOverviewPage() {
  const pageData = await getCachedHrOverviewPageData();
  if (pageData.kind === 'redirect') redirect(pageData.to);
  return (
    <div className="font-sans text-[#121212]">
      <div className="mb-7">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">People</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-[#6b6b6b]">
          Hiring and people metrics at a glance — same type styles as Time off. Open a card to jump in; use{' '}
          <Link href="/leave" className="font-medium text-[#121212] underline-offset-2 hover:underline">
            Time off
          </Link>{' '}
          for balances and requests.
        </p>
      </div>
      <HrOverviewSnapshotClient permissionKeys={pageData.permissionKeys} badges={pageData.badges} />
    </div>
  );
}
