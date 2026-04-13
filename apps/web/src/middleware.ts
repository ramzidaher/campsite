import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthPath, isPublicPath } from './lib/middleware/authPaths';
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
  nextHeaders.set('x-campsite-pathname', request.nextUrl.pathname);

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

    // Use session from cookies for routing only — avoids a full Auth HTTP round trip per
    // request (getUser hits Supabase Auth). Server Components still call getUser() / RLS.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }

  const pathname = request.nextUrl.pathname;
  const accountType = (user?.user_metadata?.account_type as string | undefined) ?? '';
  const isAuthEmailReturn =
    pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/confirm');

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
      !isAuthEmailReturn
    ) {
      const h = request.nextUrl.clone();
      h.pathname = '/login';
      return NextResponse.redirect(h);
    }
  }

  if (
    !user &&
    !isAuthPath(pathname) &&
    !isPublicPath(pathname) &&
    pathname !== '/' &&
    !isAuthEmailReturn
  ) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === '/login') {
    // Inactive members are sent here from `/` with `?error=inactive`. Sending them back to `/`
    // would loop forever (home redirects to login again).
    const loginError = request.nextUrl.searchParams.get('error');
    if (loginError === 'inactive') {
      return response;
    }
    if (accountType === 'candidate') {
      const dest = request.nextUrl.clone();
      dest.pathname = '/jobs/me';
      dest.search = '';
      return NextResponse.redirect(dest);
    }
    const dest = request.nextUrl.clone();
    dest.pathname = isPlatformAdmin ? '/dashboard' : '/';
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  if (
    user &&
    accountType === 'candidate' &&
    (pathname === '/register' || pathname.startsWith('/register/'))
  ) {
    const dest = request.nextUrl.clone();
    dest.pathname = '/jobs/me';
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  if (user && accountType === 'candidate') {
    const candidateAllowed =
      pathname.startsWith('/jobs') ||
      pathname.startsWith('/auth/') ||
      pathname === '/' ||
      isPublicPath(pathname);
    if (!candidateAllowed) {
      const dest = request.nextUrl.clone();
      dest.pathname = '/jobs/me';
      dest.search = '';
      return NextResponse.redirect(dest);
    }
  }

  if (pathname.startsWith('/jobs/offer-sign/')) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"
    );
    response.headers.set('X-Frame-Options', 'DENY');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
