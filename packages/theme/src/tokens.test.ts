import { describe, expect, it } from 'vitest';
import { getThemeTokens } from './tokens';

describe('getThemeTokens', () => {
  it('returns light theme with ocean accent', () => {
    const t = getThemeTokens('light', 'ocean');
    expect(t.background).toBe('#faf9f6');
    expect(t.accent).toBe('#44403c');
  });

  it('returns dark theme with midnight accent', () => {
    const t = getThemeTokens('dark', 'midnight');
    expect(t.background).toBe('#121212');
    expect(t.accent).toBe('#121212');
  });
});
