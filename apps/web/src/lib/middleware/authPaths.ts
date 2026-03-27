const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/auth/callback',
  '/auth/confirm',
] as const;

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
