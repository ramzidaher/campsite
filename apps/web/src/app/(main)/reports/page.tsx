import { ReportsHomeClient } from '@/components/reports/ReportsHomeClient';
import { getCachedReportsPageData } from '@/lib/reports/getCachedReportsPageData';
import { redirect } from 'next/navigation';

export default async function ReportsPage() {
  const pageData = await getCachedReportsPageData();
  if (pageData.kind === 'redirect') redirect(pageData.to);
  const { canManage, departments } = pageData;

  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-7 font-sans text-[#121212]">
      <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Reports</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
        Configure HR and Finance datasets column by columnpreview as tables, charts, or summaries, then export to CSV, Excel, or PDF.
      </p>
      <div className="mt-5">
        <ReportsHomeClient canManage={canManage} departments={departments} />
      </div>
    </div>
  );
}
