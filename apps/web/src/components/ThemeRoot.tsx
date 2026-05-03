'use client';

import {
  accentPresets,
  DEFAULT_ACCENT_PRESET,
  type AccentPreset,
} from '@campsite/theme';
import { ThemeProvider, ToastProvider } from '@campsite/ui';
import { useEffect, useState } from 'react';

function normalizeAccentPreset(raw: string | null | undefined): AccentPreset {
  const k = raw?.trim().toLowerCase();
  if (k && k in accentPresets) return k as AccentPreset;
  return DEFAULT_ACCENT_PRESET;
}

export function ThemeRoot({
  children,
  initialAccentPreset = DEFAULT_ACCENT_PRESET,
}: {
  children: React.ReactNode;
  /** From shell bundle `profile_accent_preset` */
  initialAccentPreset?: string;
}) {
  const [accent, setAccent] = useState<AccentPreset>(() =>
    normalizeAccentPreset(initialAccentPreset)
  );

  useEffect(() => {
    setAccent(normalizeAccentPreset(initialAccentPreset));
  }, [initialAccentPreset]);

  return (
    <ThemeProvider scheme="light" accent={accent}>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
