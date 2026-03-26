/** Session cache for staff discount QR token (web). Mobile should use AsyncStorage + same shape. */

export const DISCOUNT_QR_CACHE_KEY = 'campsite_discount_qr_v1';

export type DiscountQrCached = {
  token: string;
  expiresAt: string;
  issuedAt: string;
};

export function readDiscountCache(): DiscountQrCached | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(DISCOUNT_QR_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DiscountQrCached;
    if (!p.token || !p.expiresAt) return null;
    return p;
  } catch {
    return null;
  }
}

export function writeDiscountCache(c: DiscountQrCached) {
  try {
    sessionStorage.setItem(DISCOUNT_QR_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota / private mode */
  }
}

/** True if the token is still valid beyond skew (clock / network tolerance). */
export function isDiscountCacheUsable(expiresAtIso: string, skewMs = 90_000): boolean {
  return new Date(expiresAtIso).getTime() > Date.now() + skewMs;
}
