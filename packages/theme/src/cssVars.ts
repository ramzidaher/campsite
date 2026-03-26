import type { AccentPreset } from './themePresets';
import { getThemeTokens } from './tokens';

/** CSS custom property names (without leading --) */
export const cssVarNames = {
  background: '--campsite-bg',
  surface: '--campsite-surface',
  textPrimary: '--campsite-text',
  textSecondary: '--campsite-text-secondary',
  textMuted: '--campsite-text-muted',
  border: '--campsite-border',
  warning: '--campsite-warning',
  success: '--campsite-success',
  accent: '--campsite-accent',
} as const;

export function themeToCssVars(
  scheme: 'light' | 'dark',
  accentPreset: AccentPreset
): Record<string, string> {
  const t = getThemeTokens(scheme, accentPreset);
  return {
    [cssVarNames.background]: t.background,
    [cssVarNames.surface]: t.surface,
    [cssVarNames.textPrimary]: t.textPrimary,
    [cssVarNames.textSecondary]: t.textSecondary,
    [cssVarNames.textMuted]: t.textMuted,
    [cssVarNames.border]: t.border,
    [cssVarNames.warning]: t.warning,
    [cssVarNames.success]: t.success,
    [cssVarNames.accent]: t.accent,
  };
}

/** Inline style object for React `style` prop: { ['--campsite-bg']: '#faf9f6', ... } */
export function themeToInlineCssVars(
  scheme: 'light' | 'dark',
  accentPreset: AccentPreset
): Record<string, string> {
  const flat = themeToCssVars(scheme, accentPreset);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) {
    const key = k.startsWith('--') ? k : `--${k}`;
    out[key] = v;
  }
  return out;
}
