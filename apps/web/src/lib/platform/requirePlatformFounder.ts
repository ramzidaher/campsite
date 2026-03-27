import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

export async function isPlatformFounder(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: pa } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(pa);
}

/**
 * Ensures `userId` has a row in `platform_admins`. Otherwise redirects to `/` (silent deny).
 */
export async function requirePlatformFounder(supabase: SupabaseClient, userId: string): Promise<void> {
  if (!(await isPlatformFounder(supabase, userId))) {
    redirect('/');
  }
}
