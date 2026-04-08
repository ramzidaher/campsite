import { redirect } from 'next/navigation';
import { RootAuthHashGuard } from '@/components/auth/RootAuthHashGuard';
import { LandingPage } from '@/components/marketing/LandingPage';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

    redirect('/dashboard');
  }

  return (
    <>
      <RootAuthHashGuard />
      <LandingPage />
    </>
  );
}
