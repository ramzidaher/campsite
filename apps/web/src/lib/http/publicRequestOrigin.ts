import { headers } from 'next/headers';

/**
 * Absolute origin for the current request (tenant subdomain or local dev host).
 * Use in public Server Actions for email links (portal, confirmation).
 */
export async function publicRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = (h.get('x-forwarded-proto') ?? 'http').split(',')[0]?.trim() ?? 'http';
  if (!host) return '';
  return `${proto}://${host}`;
}
