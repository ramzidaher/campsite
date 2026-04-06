'use client';

import type { UiSoundEvent } from '@campsite/types';
import { useCallback, useMemo, useState } from 'react';
import { playUiSound } from './player';
import {
  clampVolume,
  readUiSoundPreferences,
  writeUiSoundEnabled,
  writeUiSoundVolume,
  type UiSoundPreferences,
} from './prefs';

export function useUiSound() {
  return useCallback((event: UiSoundEvent) => {
    void playUiSound(event);
  }, []);
}

export function useUiSoundPreferences(): {
  prefs: UiSoundPreferences;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
} {
  const initialPrefs = useMemo(() => readUiSoundPreferences(), []);
  const [prefs, setPrefs] = useState<UiSoundPreferences>(initialPrefs);

  const setEnabled = useCallback((enabled: boolean) => {
    writeUiSoundEnabled(enabled);
    setPrefs((prev) => ({ ...prev, enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const next = clampVolume(volume);
    writeUiSoundVolume(next);
    setPrefs((prev) => ({ ...prev, volume: next }));
  }, []);

  return { prefs, setEnabled, setVolume };
}
