import { parseShellPermissionKeys } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function HiringHubIndexPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const p = parseShellPermissionKeys(bundle);

  if (
    p.includes('recruitment.view') ||
    p.includes('recruitment.manage') ||
    p.includes('recruitment.approve_request') ||
    p.includes('recruitment.create_request')
  ) {
    redirect('/hr/hiring/requests');
  }
  if (p.includes('jobs.view')) redirect('/hr/hiring/jobs');
  if (p.includes('applications.view')) redirect('/hr/hiring/application-forms');
  if (p.includes('applications.view')) redirect('/hr/hiring/applications');
  if (p.includes('offers.view')) redirect('/hr/hiring/templates');

  redirect('/hr');
}
