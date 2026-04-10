import { cache } from 'react';
import { createClient } from './server';

/**
 * Returns the currently authenticated user for the current request.
 *
 * Wrapped with React cache() so that multiple server components in the same
 * render tree (layout + child layouts + page) share a single getUser() result.
 * Without this, each component made its own network call to the Supabase Auth
 * server — stacking 3-4 calls per page on admin routes.
 *
 * getUser() is used (not getSession()) to keep Supabase's JWT validation intact.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
