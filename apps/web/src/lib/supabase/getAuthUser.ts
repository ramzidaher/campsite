import { cache } from 'react';
import { createClient } from './server';

/**
 * Returns the currently authenticated user for the current request.
 *
 * Uses getSession() (cookie decode — no network round-trip) instead of getUser()
 * (validates JWT against Supabase Auth server). This is safe because:
 *  1. The middleware already calls getUser() on every request to validate the JWT.
 *  2. Supabase RLS enforces data access boundaries, so a tampered user ID in the
 *     cookie would only ever resolve to that user's own (empty) data.
 *
 * Wrapped with React cache() so multiple server components in the same render
 * tree (layout + child layouts + page) all share one result with zero extra calls.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
});
