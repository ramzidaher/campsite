import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function readUiSoundPreferences(): Promise<UiSoundPreferences> {
  try {
    const [enabledRaw, volumeRaw] = await Promise.all([
      AsyncStorage.getItem(UI_SOUNDS_ENABLED_KEY),
      AsyncStorage.getItem(UI_SOUNDS_VOLUME_KEY),
    ]);
    const enabled = enabledRaw == null ? DEFAULT_UI_SOUND_PREFERENCES.enabled : enabledRaw === '1';
    const volume =
      volumeRaw == null ? DEFAULT_UI_SOUND_PREFERENCES.volume : clampVolume(Number.parseInt(volumeRaw, 10));
    return { enabled, volume };
  } catch {
    return DEFAULT_UI_SOUND_PREFERENCES;
  }
}

export async function writeUiSoundEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(UI_SOUNDS_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    /* noop */
  }
}

export async function writeUiSoundVolume(volume: number): Promise<void> {
  try {
    await AsyncStorage.setItem(UI_SOUNDS_VOLUME_KEY, String(clampVolume(volume)));
  } catch {
    /* noop */
  }
}
