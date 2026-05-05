import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { isAuthPath, isPublicPath } from './lib/middleware/authPaths';
import { resolveHostRequestContext } from './lib/middleware/resolveHostRequestContext';
import { getSupabasePublicKey, getSupabaseUrl } from './lib/supabase/env';
import { fetchWithTimeout, getSupabaseFetchTimeoutMs } from './lib/supabase/fetchWithTimeout';
import { getPlatformAdminHost } from './lib/tenant/hostConfig';

/** `getUser()` can block on refresh + network; short timeouts falsely redirect to login under load. */
const MIDDLEWARE_AUTH_TIMEOUT_MS = Number.parseInt(
  process.env.CAMPSITE_MIDDLEWARE_AUTH_TIMEOUT_MS ?? '8000',
  10
);
const AUTH_COOKIE_NAME_PATTERNS = [
  /^sb-[^-]+-auth-token(?:\.\d+)?$/,
  /^sb-[^-]+-auth-token-code-verifier$/,
];

function clearStaleSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  const staleCookieNames = request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => AUTH_COOKIE_NAME_PATTERNS.some((pattern) => pattern.test(name)));

  for (const cookieName of staleCookieNames) {
    request.cookies.delete(cookieName);
    response.cookies.delete(cookieName);
    response.cookies.set(cookieName, '', {
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    });
  }
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const url = request.nextUrl.clone();
  const { orgSlug, isPlatformAdmin } = resolveHostRequestContext(host, url.searchParams.get('org'));

  const nextHeaders = new Headers(request.headers);
  nextHeaders.delete('x-campsite-org-slug');
  nextHeaders.delete('x-campsite-platform-admin');
  nextHeaders.delete('x-campsite-pathname');
  if (orgSlug) {
    nextHeaders.set('x-campsite-org-slug', orgSlug);
  }
  nextHeaders.set('x-campsite-platform-admin', isPlatformAdmin ? '1' : '0');
  nextHeaders.set('x-campsite-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: nextHeaders } });

  const supabaseUrl = getSupabaseUrl();
  const supabasePublicKey = getSupabasePublicKey();

  let user: User | null = null;
  /** Let the request reach the app so RSC can re-run auth instead of bouncing to login on stalls/races. */
  let authTransientFailure = false;
  if (supabaseUrl && supabasePublicKey) {
    const supabase = createServerClient(supabaseUrl, supabasePublicKey, {
      global: {
        fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetchWithTimeout(input, init, getSupabaseFetchTimeoutMs()),
      },
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

    try {
      const authResult = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('middleware auth timeout')), MIDDLEWARE_AUTH_TIMEOUT_MS);
        }),
      ]);
      user = authResult.data.user ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      const lowerMessage = message.toLowerCase();
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      const authTimedOut = message.includes('middleware auth timeout');
      const isRefreshTokenAlreadyUsed =
        code === 'refresh_token_already_used' || message.includes('Invalid Refresh Token: Already Used');
      const isRefreshTokenNotFound = code === 'refresh_token_not_found';
      const isTransientNetworkAuthError =
        lowerMessage.includes('fetch failed') || message.includes('AuthRetryableFetchError');
      if (
        authTimedOut ||
        isRefreshTokenAlreadyUsed ||
        isRefreshTokenNotFound ||
        isTransientNetworkAuthError
      ) {
        // Concurrent tab/navigation refreshes can lose the rotation race (`already_used` / `not_found`).
        // Slow auth must not clear cookies or force login — layouts and pages call `getUser()` again.
        authTransientFailure = true;
      } else if (message.includes('Invalid Refresh Token')) {
        clearStaleSupabaseAuthCookies(request, response);
      }
      user = null;
    }
  }

  const pathname = request.nextUrl.pathname;
  const accountType = (user?.user_metadata?.account_type as string | undefined) ?? '';
  const isAuthEmailReturn =
    pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/confirm');

  // Canonicalize legacy admin HR paths to the primary HR workspace routes.
  // Keep query params intact to avoid breaking deep links and filters.
  if (pathname === '/admin/hr' || pathname.startsWith('/admin/hr/')) {
    const canonical = request.nextUrl.clone();
    canonical.pathname =
      pathname === '/admin/hr' ? '/hr' : pathname.replace(/^\/admin\/hr\//, '/hr/');
    return NextResponse.redirect(canonical);
  }

  if (pathname === '/admin/jobs' || pathname.startsWith('/admin/jobs/')) {
    const canonical = request.nextUrl.clone();
    canonical.pathname =
      pathname === '/admin/jobs' ? '/hr/jobs' : pathname.replace(/^\/admin\/jobs\//, '/hr/jobs/');
    return NextResponse.redirect(canonical);
  }

  if (pathname === '/founders' || pathname.startsWith('/founders/')) {
    if (!isPlatformAdmin) {
      const dest = request.nextUrl.clone();
      dest.host = getPlatformAdminHost();
      return NextResponse.redirect(dest);
    }
  }

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
      if (authTransientFailure) {
        return response;
      }
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
    if (authTransientFailure) {
      return response;
    }
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
    const nextParam = request.nextUrl.searchParams.get('next');
    if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('/login')) {
      const dest = request.nextUrl.clone();
      dest.pathname = nextParam;
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
  // Keep middleware off Next internals, API routes, and static assets.
  // This avoids running Supabase auth/session logic on requests that do not
  // participate in app routing (significant latency reduction in dev/prod).
  matcher: [
    '/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff|woff2|ttf|eot)$).*)',
  ],
};
