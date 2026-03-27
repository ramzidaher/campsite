import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  completeRegistrationProfileIfNeeded,
  syncRegistrationAvatarToProfileIfEmpty,
} from '@/lib/auth/completeRegistrationProfile';
import { getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/env';

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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  if (searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const next = safeNextPath(searchParams.get('next'));
  const token_hash = searchParams.get('token_hash');
  const typeRaw = searchParams.get('type');
  const code = searchParams.get('code');

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
        );
      },
    },
  });

  let sessionOk = false;

  if (token_hash && typeRaw && isEmailLinkType(typeRaw)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: typeRaw });
    sessionOk = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    sessionOk = !error;
  }

  if (!sessionOk) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const done = await completeRegistrationProfileIfNeeded(supabase, user);
    if (!done.ok) {
      return NextResponse.redirect(
        `${origin}/pending?registration_error=${encodeURIComponent(done.message)}`
      );
    }
    await syncRegistrationAvatarToProfileIfEmpty(supabase, user);
  }

  return response;
}
