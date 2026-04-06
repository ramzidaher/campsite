import type { UiSoundEvent } from '@campsite/types';
import { useCallback, useEffect, useState } from 'react';

import { playUiSound } from './player';
import {
  clampVolume,
  DEFAULT_UI_SOUND_PREFERENCES,
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
  loading: boolean;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
} {
  const [prefs, setPrefs] = useState<UiSoundPreferences>(DEFAULT_UI_SOUND_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void readUiSoundPreferences().then((next) => {
      if (!mounted) return;
      setPrefs(next);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    setPrefs((prev) => ({ ...prev, enabled }));
    void writeUiSoundEnabled(enabled);
  }, []);

  const setVolume = useCallback((volume: number) => {
    const next = clampVolume(volume);
    setPrefs((prev) => ({ ...prev, volume: next }));
    void writeUiSoundVolume(next);
  }, []);

  return { prefs, loading, setEnabled, setVolume };
}
