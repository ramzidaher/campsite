import type { AccentPreset } from './themePresets';
import { getThemeTokens } from './tokens';

/** React Native `useColorScheme`-friendly palette object. */
export function getNativeTheme(scheme: 'light' | 'dark', accentPreset: AccentPreset) {
  const t = getThemeTokens(scheme, accentPreset);
  return {
    colors: {
      background: t.background,
      surface: t.surface,
      text: t.textPrimary,
      textSecondary: t.textSecondary,
      textMuted: t.textMuted,
      border: t.border,
      warning: t.warning,
      success: t.success,
      accent: t.accent,
    },
  };
}
