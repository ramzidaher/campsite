import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSupabasePublicKey, getSupabaseUrl } from './lib/supabase/env';

const PLATFORM_ADMIN_HOST = 'admin.campsite.app';
const ROOT_DOMAIN = 'campsite.app';

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/auth/callback'];

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  let orgSlug: string | null = null;
  let isPlatformAdmin = false;

  if (host === PLATFORM_ADMIN_HOST || host.startsWith('admin.localhost')) {
    isPlatformAdmin = true;
  } else {
    const hostname = host.split(':')[0] ?? '';
    if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
      orgSlug = hostname.replace(`.${ROOT_DOMAIN}`, '');
    } else if (hostname.endsWith('.localhost')) {
      orgSlug = hostname.replace('.localhost', '');
    }
  }
  const url = request.nextUrl.clone();
  if (!orgSlug && url.searchParams.get('org')) {
    orgSlug = url.searchParams.get('org');
  }

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
