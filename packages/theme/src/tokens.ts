import type { AccentPreset } from './themePresets';
import { accentPresets } from './themePresets';

export type ColorScheme = 'light' | 'dark';

export interface ThemeTokens {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  warning: string;
  success: string;
  accent: string;
}

const lightBase = {
  background: '#faf9f6',
  surface: '#f5f4f1',
  textPrimary: '#121212',
  textSecondary: '#6B6B6B',
  textMuted: '#9B9B9B',
  border: '#D8D8D8',
  warning: '#B91C1C',
  success: '#15803D',
} as const;

const darkBase = {
  background: '#121212',
  surface: '#1a1a1a',
  textPrimary: '#faf9f6',
  textSecondary: '#808080',
  textMuted: '#B0B0B0',
  border: '#2A2A2A',
  warning: '#F87171',
  success: '#4ADE80',
} as const;

export function getAccentColor(preset: AccentPreset): string {
  return accentPresets[preset];
}

export function getThemeTokens(
  scheme: ColorScheme,
  accentPreset: AccentPreset
): ThemeTokens {
  const base = scheme === 'light' ? lightBase : darkBase;
  return {
    ...base,
    accent: getAccentColor(accentPreset),
  };
}
