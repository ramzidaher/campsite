import type { UiSoundEvent } from '@campsite/types';

import { UI_SOUND_PRESETS } from './presets';
import { readUiSoundPreferences } from './prefs';
import { synthPresetToWavDataUri } from './synth';

const lastPlayedAt = new Map<UiSoundEvent, number>();
let audioModeConfigured = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  // expo-av is deprecated for our current Expo SDK; keep this as a no-op
  // so callers can remain async while native audio migration is in progress.
  audioModeConfigured = true;
}

export async function playUiSound(event: UiSoundEvent): Promise<void> {
  const prefs = await readUiSoundPreferences();
  if (!prefs.enabled || prefs.volume <= 0) return;

  const preset = UI_SOUND_PRESETS[event];
  const nowMs = Date.now();
  const minInterval = preset.minIntervalMs ?? 0;
  const last = lastPlayedAt.get(event) ?? 0;
  if (nowMs - last < minInterval) return;
  lastPlayedAt.set(event, nowMs);

  await ensureAudioMode();
  // Temporary fallback until we migrate to expo-audio.
  void synthPresetToWavDataUri(preset, (prefs.volume / 100) * (preset.eventGain ?? 1));
}
