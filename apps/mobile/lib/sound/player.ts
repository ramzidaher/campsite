import type { UiSoundEvent } from '@campsite/types';
import { Audio } from 'expo-av';

import { UI_SOUND_PRESETS } from './presets';
import { readUiSoundPreferences } from './prefs';
import { synthPresetToWavDataUri } from './synth';

const lastPlayedAt = new Map<UiSoundEvent, number>();
let audioModeConfigured = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    audioModeConfigured = true;
  } catch {
    /* noop */
  }
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

  const gainScale = (prefs.volume / 100) * (preset.eventGain ?? 1);
  const uri = synthPresetToWavDataUri(preset, gainScale);
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1.0 },
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if ('isLoaded' in status && status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
  } catch {
    /* noop */
  }
}
