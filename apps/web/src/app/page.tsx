import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/marketing/LandingPage';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      redirect('/register');
    }
    if (profile.status === 'pending') {
      redirect('/pending');
    }
    if (profile.status === 'inactive') {
      redirect('/login?error=inactive');
    }

    redirect('/dashboard');
  }

  return <LandingPage />;
}
