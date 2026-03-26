'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/** Best-effort: create profile from auth.users metadata when session exists (e.g. after email confirm). */
export function RegisterDoneRepair() {
  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      await supabase.rpc('ensure_my_registration_profile');
    })();
  }, []);
  return null;
}
