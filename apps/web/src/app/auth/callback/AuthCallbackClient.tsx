'use client';

import type { EmailOtpType } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import {
  completeRegistrationProfileIfNeeded,
  syncRegistrationAvatarToProfileIfEmpty,
} from '@/lib/auth/completeRegistrationProfile';
import { createClient } from '@/lib/supabase/client';

const EMAIL_LINK_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const satisfies readonly EmailOtpType[];

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function isEmailLinkType(t: string): t is EmailOtpType {
  return (EMAIL_LINK_TYPES as readonly string[]).includes(t);
}

/**
 * Email links (invite, magic link, etc.) often land here with tokens in the **hash** (#access_token=...).
 * Browsers never send the hash to the server, so this must run in the client.
 * Query-style returns (?token_hash= / ?code=) are also supported.
 */
export function AuthCallbackClient() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    void (async () => {
      const full = new URL(window.location.href);

      if (full.searchParams.get('error')) {
        router.replace('/login?error=auth');
        return;
      }

      const next = safeNextPath(full.searchParams.get('next'));
      const forceSetPassword = full.searchParams.get('force_set_password') === '1';
      const token_hash = full.searchParams.get('token_hash');
      const typeInQuery = full.searchParams.get('type');
      const code = full.searchParams.get('code');

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const typeInHash = hashParams.get('type');
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      const supabase = createClient();
      let sessionOk = false;

      if (token_hash && typeInQuery && isEmailLinkType(typeInQuery)) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type: typeInQuery });
        sessionOk = !error;
      } else if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        sessionOk = !error;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        sessionOk = !error;
      }

      if (!alive) return;

      if (!sessionOk) {
        router.replace('/login?error=auth');
        return;
      }

      await supabase.rpc('profile_clear_reauth_required');

      window.history.replaceState(null, '', `${full.pathname}${full.search}`);

      const { data: { user } } = await supabase.auth.getUser();

      if (!alive || !user) {
        router.replace('/login?error=auth');
        return;
      }

      const done = await completeRegistrationProfileIfNeeded(supabase, user);
      if (!done.ok) {
        router.replace(`/pending?registration_error=${encodeURIComponent(done.message)}`);
        return;
      }

      await syncRegistrationAvatarToProfileIfEmpty(supabase, user);

      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const mustSetPassword = meta?.must_set_password === true;
      const isInviteType = typeInQuery === 'invite' || typeInHash === 'invite';

      let to = next;
      if (forceSetPassword || mustSetPassword || isInviteType) {
        const inviteHint = forceSetPassword || (isInviteType && !mustSetPassword) ? '&from_invite=1' : '';
        to = `/auth/set-password?next=${encodeURIComponent(next)}${inviteHint}`;
      }

      router.replace(to);
      router.refresh();
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6">
      <span
        className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[#d8d8d8] border-t-[#121212]"
        aria-hidden
      />
      <p className="text-sm text-[#6b6b6b]">Completing sign-in...</p>
    </div>
  );
}
