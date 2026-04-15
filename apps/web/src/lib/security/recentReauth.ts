import type { User } from '@supabase/supabase-js';

const DEFAULT_MAX_AGE_MINUTES = 15;

export function hasRecentReauth(user: User, maxAgeMinutes = DEFAULT_MAX_AGE_MINUTES): boolean {
  const lastSignInAt = user.last_sign_in_at;
  if (!lastSignInAt) return false;

  const lastSignInMs = Date.parse(lastSignInAt);
  if (!Number.isFinite(lastSignInMs)) return false;

  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  return Date.now() - lastSignInMs <= maxAgeMs;
}

