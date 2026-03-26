import type { AccentPreset, ColorScheme, ThemeTokens } from '@campsite/theme';
import { getThemeTokens } from '@campsite/theme';
import React, { createContext, useContext, useMemo } from 'react';

export interface CampsiteThemeContextValue {
  scheme: ColorScheme;
  accent: AccentPreset;
  tokens: ThemeTokens;
}

const CampsiteThemeContext = createContext<CampsiteThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  scheme: ColorScheme;
  accent?: AccentPreset;
}

export function ThemeProvider({
  children,
  scheme,
  accent = 'midnight',
}: ThemeProviderProps) {
  const tokens = useMemo(() => getThemeTokens(scheme, accent), [scheme, accent]);
  const value = useMemo(
    () => ({ scheme, accent, tokens }),
    [scheme, accent, tokens]
  );
  return (
    <CampsiteThemeContext.Provider value={value}>{children}</CampsiteThemeContext.Provider>
  );
}

export function useCampsiteTheme(): CampsiteThemeContextValue {
  const ctx = useContext(CampsiteThemeContext);
  if (!ctx) {
    throw new Error('useCampsiteTheme must be used within ThemeProvider');
  }
  return ctx;
}
