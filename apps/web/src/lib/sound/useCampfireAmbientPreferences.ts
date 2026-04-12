'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  clampCampfireVolume,
  readAmbientCampfirePreferences,
  writeAmbientCampfireEnabled,
  writeAmbientCampfireVolume,
  type AmbientCampfirePreferences,
} from './ambientCampfirePrefs';

export function useCampfireAmbientPreferences(): {
  prefs: AmbientCampfirePreferences;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
} {
  const initialPrefs = useMemo(() => readAmbientCampfirePreferences(), []);
  const [prefs, setPrefs] = useState<AmbientCampfirePreferences>(initialPrefs);

  const setEnabled = useCallback((enabled: boolean) => {
    writeAmbientCampfireEnabled(enabled);
    setPrefs((prev) => ({ ...prev, enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const next = clampCampfireVolume(volume);
    writeAmbientCampfireVolume(next);
    setPrefs((prev) => ({ ...prev, volume: next }));
  }, []);

  return { prefs, setEnabled, setVolume };
}
