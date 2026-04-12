export const AMBIENT_CAMPFIRE_ENABLED_KEY = 'campsite_ambient_campfire_enabled';
export const AMBIENT_CAMPFIRE_VOLUME_KEY = 'campsite_ambient_campfire_volume';

export type AmbientCampfirePreferences = {
  enabled: boolean;
  volume: number;
};

export const DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES: AmbientCampfirePreferences = {
  enabled: false,
  volume: 32,
};

export const CAMPFIRE_PREFS_CHANGED_EVENT = 'campsite-ambient-campfire-changed';

export function clampCampfireVolume(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES.volume;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function readAmbientCampfirePreferences(): AmbientCampfirePreferences {
  if (typeof window === 'undefined') return DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES;
  try {
    const enabledRaw = localStorage.getItem(AMBIENT_CAMPFIRE_ENABLED_KEY);
    const volumeRaw = localStorage.getItem(AMBIENT_CAMPFIRE_VOLUME_KEY);
    const enabled =
      enabledRaw == null ? DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES.enabled : enabledRaw === '1';
    const volume =
      volumeRaw == null
        ? DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES.volume
        : clampCampfireVolume(Number.parseInt(volumeRaw, 10));
    return { enabled, volume };
  } catch {
    return DEFAULT_AMBIENT_CAMPFIRE_PREFERENCES;
  }
}

function dispatchChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CAMPFIRE_PREFS_CHANGED_EVENT));
}

export function writeAmbientCampfireEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AMBIENT_CAMPFIRE_ENABLED_KEY, enabled ? '1' : '0');
    dispatchChanged();
  } catch {
    /* noop */
  }
}

export function writeAmbientCampfireVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AMBIENT_CAMPFIRE_VOLUME_KEY, String(clampCampfireVolume(volume)));
    dispatchChanged();
  } catch {
    /* noop */
  }
}
