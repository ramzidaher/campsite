import { PrivacyAdminClient } from '@/components/privacy/PrivacyAdminClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function AdminPrivacyPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;
  const [{ data: canViewPolicies }, { data: canReview }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.retention_policy.view', p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.review', p_context: {},
    }),
  ]);
  if (!canViewPolicies && !canReview) redirect('/admin');
  return <PrivacyAdminClient />;
}
