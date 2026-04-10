'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

/** Second attempt to run DB registration apply (reads auth.users metadata). */
export async function retryEnsureRegistrationProfile() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.rpc('ensure_my_registration_profile');
  if (error) {
    redirect(`/pending?registration_error=${encodeURIComponent(error.message)}`);
  }

  redirect('/pending');
}
