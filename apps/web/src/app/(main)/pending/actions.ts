'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

/** Second attempt to run DB registration apply (reads auth.users metadata). */
export async function retryEnsureRegistrationProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.rpc('ensure_my_registration_profile');
  if (error) {
    redirect(`/pending?registration_error=${encodeURIComponent(error.message)}`);
  }

  redirect('/pending');
}
