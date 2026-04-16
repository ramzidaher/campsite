import { PrivacyAdminClient } from '@/components/privacy/PrivacyAdminClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function AdminPrivacyPage() {
  const pathStartedAtMs = Date.now();
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const supabase = await createClient();
  const { data: profile } = await withServerPerf(
    '/admin/privacy',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;
  const permissionKeys = await withServerPerf(
    '/admin/privacy',
    'get_my_permissions',
    getMyPermissions(orgId),
    300
  );
  if (!permissionKeys.includes('privacy.retention_policy.view') && !permissionKeys.includes('privacy.erasure_request.review')) redirect('/admin');
  const view = <PrivacyAdminClient />;
  warnIfSlowServerPath('/admin/privacy', pathStartedAtMs);
  return view;
}
