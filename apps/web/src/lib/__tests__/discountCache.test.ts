import { isDiscountCacheUsable } from '@/lib/discountCache';

describe('isDiscountCacheUsable', () => {
  it('returns false when token already expired', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isDiscountCacheUsable(past, 0)).toBe(false);
  });

  it('returns true when expiry is beyond skew', () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    expect(isDiscountCacheUsable(future, 90_000)).toBe(true);
  });

  it('returns false when within skew window', () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    expect(isDiscountCacheUsable(soon, 90_000)).toBe(false);
  });
});
