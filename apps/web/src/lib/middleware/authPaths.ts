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

/** Unauthenticated access (e.g. public job listings). Keep narrow. */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/jobs' || pathname.startsWith('/jobs/');
}
