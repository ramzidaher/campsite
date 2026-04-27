import type { SupabaseClient } from '@supabase/supabase-js';

function withForceSetPasswordParam(redirectTo: string): string {
  const url = new URL(redirectTo);
  url.searchParams.set('force_set_password', '1');
  return url.toString();
}

export function isAuthUserAlreadyExistsError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already') ||
    m.includes('registered') ||
    m.includes('exists') ||
    m.includes('duplicate')
  );
}

export type SendOrgMemberAccessEmailResult =
  | { ok: true; channel: 'invite'; authUserId: string }
  | { ok: true; channel: 'magiclink' }
  | { ok: false; error: string };

/**
 * Sends either an invite email (new auth user) or a magic-link email (existing user).
 * Uses service-role client only on the server.
 */
export async function sendOrgMemberAccessEmail(
  admin: SupabaseClient,
  email: string,
  redirectTo: string,
  inviteUserMetadata?: Record<string, unknown>
): Promise<SendOrgMemberAccessEmailResult> {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: withForceSetPasswordParam(redirectTo),
    data: { must_set_password: true, ...inviteUserMetadata },
  });

  if (!error && data.user?.id) {
    return { ok: true, channel: 'invite', authUserId: data.user.id };
  }

  if (error && !isAuthUserAlreadyExistsError(error.message)) {
    return { ok: false, error: error.message };
  }

  const { error: otpError } = await admin.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: withForceSetPasswordParam(redirectTo),
      shouldCreateUser: false,
    },
  });

  if (otpError) {
    return { ok: false, error: otpError.message };
  }

  return { ok: true, channel: 'magiclink' };
}
