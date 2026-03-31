import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key/shape as web `discountCache.ts` (web uses sessionStorage). */
export const DISCOUNT_QR_CACHE_KEY = 'campsite_discount_qr_v1';

export type DiscountQrCached = {
  token: string;
  expiresAt: string;
  issuedAt: string;
};

export async function readDiscountCache(): Promise<DiscountQrCached | null> {
  try {
    const raw = await AsyncStorage.getItem(DISCOUNT_QR_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as DiscountQrCached;
    if (!p.token || !p.expiresAt) return null;
    return p;
  } catch {
    return null;
  }
}

export async function writeDiscountCache(c: DiscountQrCached): Promise<void> {
  try {
    await AsyncStorage.setItem(DISCOUNT_QR_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export async function clearDiscountCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DISCOUNT_QR_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** True if the token is still valid beyond skew (clock / network tolerance). */
export function isDiscountCacheUsable(expiresAtIso: string, skewMs = 90_000): boolean {
  return new Date(expiresAtIso).getTime() > Date.now() + skewMs;
}
