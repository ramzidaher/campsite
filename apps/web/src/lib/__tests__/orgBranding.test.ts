import {
  normalizeOrgBrandPolicy,
  resolveOrgBranding,
  sanitizeOrgBrandTokens,
  suggestedBrandTokensFromHexes,
} from '@/lib/orgBranding';

describe('orgBranding', () => {
  it('sanitizes custom tokens to known hex keys only', () => {
    const out = sanitizeOrgBrandTokens({
      primary: '#112233',
      secondary: '#abc',
      bogus: '#ffffff',
      text: 'red',
    });
    expect(out).toEqual({
      primary: '#112233',
      secondary: '#aabbcc',
    });
  });

  it('normalizes invalid policy to hybrid default', () => {
    expect(normalizeOrgBrandPolicy('x')).toBe('brand_base_with_celebration_accents');
  });

  it('resolves preset + custom token merge', () => {
    const resolved = resolveOrgBranding({
      presetKey: 'ocean',
      customTokens: { primary: '#222222' },
      policy: 'brand_overrides_celebration',
      effectiveMode: 'pride',
    });
    expect(resolved.tokens.primary).toBe('#222222');
    expect(resolved.policy).toBe('brand_overrides_celebration');
    expect(resolved.shouldApplyCelebrationGradient).toBe(false);
  });

  it('allows celebration gradient for hybrid and override policy', () => {
    const a = resolveOrgBranding({
      presetKey: 'campfire',
      customTokens: {},
      policy: 'celebration_overrides_brand',
      effectiveMode: 'pride',
    });
    const b = resolveOrgBranding({
      presetKey: 'campfire',
      customTokens: {},
      policy: 'brand_base_with_celebration_accents',
      effectiveMode: 'pride',
    });
    expect(a.shouldApplyCelebrationGradient).toBe(true);
    expect(b.shouldApplyCelebrationGradient).toBe(true);
  });

  it('maps suggested tokens from ordered hex list', () => {
    expect(suggestedBrandTokensFromHexes(['#111111', '#222222', '#333333'])).toEqual({
      primary: '#111111',
      secondary: '#222222',
      accent: '#333333',
    });
  });
});

