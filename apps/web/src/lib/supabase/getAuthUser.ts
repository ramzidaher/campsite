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
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRetryableFetchFailure =
      message.toLowerCase().includes('fetch failed') ||
      message.includes('AuthRetryableFetchError');
    if (isRetryableFetchFailure) {
      // Fail open on transient auth network issues so SSR routes can still render.
      return null;
    }
    throw error;
  }
});
