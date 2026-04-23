import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { RootAuthHashGuard } from '@/components/auth/RootAuthHashGuard';
import { LandingPage } from '@/components/marketing/LandingPage';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { tenantHostMatchesOrg, tenantSubdomainOriginForHost } from '@/lib/tenant/adminUrl';

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  const host = (await headers()).get('host');

  if (user) {
    const [founder, { data: profile }] = await Promise.all([
      isPlatformFounder(supabase, user.id),
      supabase.from('profiles').select('status, role, org_id').eq('id', user.id).maybeSingle(),
    ]);

    if (founder) {
      if (!profile) {
        redirect('/founders');
      }
      if (profile.status === 'inactive') {
        redirect('/login?error=inactive');
      }
      if (profile.status === 'pending') {
        redirect('/pending');
      }
      if (!profile.org_id) {
        redirect('/founders');
      }
      redirect('/session-choice');
    }

    if (!profile) {
      // `/pending` runs `completeRegistrationProfileIfNeeded` (RPC + JWT metadata) before showing errors.
      redirect('/pending');
    }
    if (profile.status === 'pending') {
      redirect('/pending');
    }
    if (profile.status === 'inactive') {
      redirect('/login?error=inactive');
    }

    if (profile.org_id) {
      const { data: org } = await supabase
        .from('organisations')
        .select('slug')
        .eq('id', profile.org_id)
        .maybeSingle();
      const orgSlug = (org?.slug as string | undefined)?.trim();
      if (orgSlug && !tenantHostMatchesOrg(orgSlug, host)) {
        redirect(`${tenantSubdomainOriginForHost(orgSlug, host)}/dashboard`);
      }
    }

    redirect('/dashboard');
  }

  return (
    <>
      <RootAuthHashGuard />
      <LandingPage />
    </>
  );
}
