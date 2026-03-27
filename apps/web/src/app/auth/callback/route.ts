import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  completeRegistrationProfileIfNeeded,
  syncRegistrationAvatarToProfileIfEmpty,
} from '@/lib/auth/completeRegistrationProfile';
import { getSupabasePublicKey, getSupabaseUrl } from '@/lib/supabase/env';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();

  if (code && url && key) {
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = createServerClient(
      url,
      key,
      {
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
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
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
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
