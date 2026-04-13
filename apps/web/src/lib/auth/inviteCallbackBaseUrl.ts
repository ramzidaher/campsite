import type { NextRequest } from 'next/server';

import { getTenantRootDomain } from '@/lib/tenant/hostConfig';

const LOCALHOST_SITE_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function isVercelDeploymentHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.endsWith('.vercel.app') || h === 'vercel.app';
}

function trimBaseUrl(raw: string | undefined): string | null {
  const t = raw?.trim().replace(/\/$/, '');
  return t?.length ? t : null;
}

function parseHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

function allowedHostsFromEnv(): Set<string> {
  const allowed = new Set<string>();
  const siteUrl = trimBaseUrl(process.env.SITE_URL);
  const nextPublic = trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (siteUrl) {
    const host = parseHost(siteUrl);
    if (host) allowed.add(host);
  }
  if (nextPublic) {
    const host = parseHost(nextPublic);
    if (host) allowed.add(host);
  }
  allowed.add(`admin.${getTenantRootDomain().toLowerCase()}`);
  return allowed;
}

function isAllowedForwardedHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  const hostNoPort = normalized.split(':')[0] ?? '';
  if (!hostNoPort) return false;
  if (isLocalHostname(hostNoPort)) return process.env.NODE_ENV !== 'production';
  const allowedHosts = allowedHostsFromEnv();
  if (allowedHosts.has(normalized) || allowedHosts.has(hostNoPort)) return true;
  const root = getTenantRootDomain().toLowerCase();
  return hostNoPort.endsWith(`.${root}`) || hostNoPort === root;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/**
 * Base URL for Supabase invite / magic-link `redirectTo` and `emailRedirectTo`.
 * No VERCEL_URL fallback: production should set SITE_URL / NEXT_PUBLIC_SITE_URL, or rely on the request host.
 */
export function inviteCallbackBaseUrl(req: NextRequest): string | null {
  const siteUrl = trimBaseUrl(process.env.SITE_URL);
  const nextPublic = trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  const isProd = process.env.NODE_ENV === 'production';

  if (siteUrl) return siteUrl;
  if (isProd) return null;

  const hostHeader = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') === 'http' ? 'http' : 'https';
  const hostnameOnly = hostHeader?.split(':')[0] ?? '';
  const forwardedBase =
    hostHeader && hostnameOnly && isAllowedForwardedHost(hostHeader) ? `${proto}://${hostHeader}` : null;

  if (nextPublic) {
    const isLocal = LOCALHOST_SITE_RE.test(nextPublic);
    if (!isLocal) return nextPublic;
    if (forwardedBase) return forwardedBase;
    return nextPublic;
  }

  if (forwardedBase) return forwardedBase;
  return null;
}

/**
 * Base URL for Supabase `emailRedirectTo` from the browser (e.g. sign-up).
 * Uses `window.location.origin` on real hosts; on Vercel project URLs (`*.vercel.app`) uses
 * `NEXT_PUBLIC_SITE_URL` so verification emails use the canonical domain (not the deployment host).
 */
export function clientEmailRedirectBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  if (!isVercelDeploymentHostname(window.location.hostname)) return window.location.origin;

  const configured = trimBaseUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured && !LOCALHOST_SITE_RE.test(configured)) return configured;

  return `https://${getTenantRootDomain()}`;
}

export function inviteCallbackUrl(req: NextRequest, nextPath = '/dashboard'): string | null {
  const base = inviteCallbackBaseUrl(req);
  const next = encodeURIComponent(nextPath);
  const path = `/auth/callback?next=${next}`;
  if (!base) return null;
  return `${base}${path}`;
}
