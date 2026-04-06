export const UI_SOUNDS_ENABLED_KEY = 'campsite_ui_sounds_enabled';
export const UI_SOUNDS_VOLUME_KEY = 'campsite_ui_sounds_volume';

export type UiSoundPreferences = {
  enabled: boolean;
  volume: number;
};

export const DEFAULT_UI_SOUND_PREFERENCES: UiSoundPreferences = {
  enabled: true,
  volume: 70,
};

export function clampVolume(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_UI_SOUND_PREFERENCES.volume;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function readUiSoundPreferences(): UiSoundPreferences {
  if (typeof window === 'undefined') return DEFAULT_UI_SOUND_PREFERENCES;
  try {
    const enabledRaw = localStorage.getItem(UI_SOUNDS_ENABLED_KEY);
    const volumeRaw = localStorage.getItem(UI_SOUNDS_VOLUME_KEY);
    const enabled = enabledRaw == null ? DEFAULT_UI_SOUND_PREFERENCES.enabled : enabledRaw === '1';
    const volume =
      volumeRaw == null ? DEFAULT_UI_SOUND_PREFERENCES.volume : clampVolume(Number.parseInt(volumeRaw, 10));
    return { enabled, volume };
  } catch {
    return DEFAULT_UI_SOUND_PREFERENCES;
  }
}

export function writeUiSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UI_SOUNDS_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* noop */
  }
}

export function writeUiSoundVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(UI_SOUNDS_VOLUME_KEY, String(clampVolume(volume)));
  } catch {
    /* noop */
  }
}
