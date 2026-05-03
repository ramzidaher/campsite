function trimOrigin(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/$/, '');
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * Canonical web origin for OAuth redirect_uri values.
 * Production must use SITE_URL / NEXT_PUBLIC_SITE_URL so tenant subdomains share one registered callback.
 */
export function buildOAuthAppBaseUrl(req: Request): string {
  const reqUrl = new URL(req.url);
  if (isLocalHostname(reqUrl.hostname)) {
    const port = reqUrl.port ? `:${reqUrl.port}` : '';
    return `http://localhost${port}`;
  }
  return trimOrigin(process.env.SITE_URL) ?? trimOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? reqUrl.origin;
}
