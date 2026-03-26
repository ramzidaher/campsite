export const accentPresets = {
  midnight: '#121212',
  ocean: '#1D4ED8',
  emerald: '#059669',
  sunset: '#F97316',
  orchid: '#7C3AED',
  rose: '#E11D48',
} as const;

export type AccentPreset = keyof typeof accentPresets;

export const DEFAULT_ACCENT_PRESET: AccentPreset = 'midnight';
