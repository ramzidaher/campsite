const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/auth/callback',
  '/auth/confirm',
  '/auth/set-password',
] as const;

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Unauthenticated access (e.g. public job listings, legal pages). Keep narrow. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) return true;
  if (pathname === '/terms' || pathname === '/privacy') return true;
  if (pathname === '/legal/data-processing' || pathname.startsWith('/legal/data-processing/')) {
    return true;
  }
  return false;
}
