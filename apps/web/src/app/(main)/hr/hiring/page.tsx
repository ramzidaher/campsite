import { getCachedHrHiringHubPageData } from '@/lib/hr/getCachedHrHiringHubPageData';
import { redirect } from 'next/navigation';

export default async function HiringHubIndexPage() {
  const pageData = await getCachedHrHiringHubPageData();
  redirect(pageData.redirectTo);
}
