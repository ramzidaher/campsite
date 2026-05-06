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
    const lower = message.toLowerCase();
    const isRetryableFetchFailure =
      lower.includes('fetch failed') ||
      lower.includes('authretryablefetcherror') ||
      lower.includes('supabase_fetch_timeout_after_');
    if (isRetryableFetchFailure) {
      // Fail open on transient auth/provider stalls: prefer cookie-backed session user to avoid
      // forcing a login redirect during temporary network timeouts.
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return session?.user ?? null;
      } catch {
        return null;
      }
    }
    throw error;
  }
});
