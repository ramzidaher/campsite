import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthPath } from './lib/middleware/authPaths';
import { resolveHostRequestContext } from './lib/middleware/resolveHostRequestContext';
import { getSupabasePublicKey, getSupabaseUrl } from './lib/supabase/env';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const url = request.nextUrl.clone();
  const { orgSlug, isPlatformAdmin } = resolveHostRequestContext(host, url.searchParams.get('org'));

  const nextHeaders = new Headers(request.headers);
  if (orgSlug) {
    nextHeaders.set('x-campsite-org-slug', orgSlug);
  }
  nextHeaders.set('x-campsite-platform-admin', isPlatformAdmin ? '1' : '0');

  let response = NextResponse.next({ request: { headers: nextHeaders } });

  const supabaseUrl = getSupabaseUrl();
  const supabasePublicKey = getSupabasePublicKey();

  let user: User | null = null;
  if (supabaseUrl && supabasePublicKey) {
    const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: nextHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  const pathname = request.nextUrl.pathname;
  const isCallback = pathname.startsWith('/auth/callback');

  if (pathname.startsWith('/platform')) {
    const dest = request.nextUrl.clone();
    if (pathname === '/platform/login' || pathname.startsWith('/platform/login/')) {
      dest.pathname = '/login';
      dest.search = '';
      const nextParam = request.nextUrl.searchParams.get('next');
      if (nextParam) dest.searchParams.set('next', nextParam);
      return NextResponse.redirect(dest);
    }
    if (!user) {
      dest.pathname = '/login';
      dest.searchParams.set('next', '/dashboard');
      return NextResponse.redirect(dest);
    }
    dest.pathname = '/dashboard';
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  if (isPlatformAdmin) {
    if (pathname === '/') {
      const h = request.nextUrl.clone();
      h.pathname = '/dashboard';
      return NextResponse.redirect(h);
    }
    if (
      (pathname.startsWith('/register') || pathname.startsWith('/forgot-password')) &&
      !isCallback
    ) {
      const h = request.nextUrl.clone();
      h.pathname = '/login';
      return NextResponse.redirect(h);
    }
  }

  if (!user && !isAuthPath(pathname) && pathname !== '/' && !isCallback) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === '/login') {
    const dest = request.nextUrl.clone();
    dest.pathname = isPlatformAdmin ? '/dashboard' : '/';
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
