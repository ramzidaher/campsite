import type { UiSoundEvent, UiSoundToneSpec } from '@campsite/types';
import { UI_SOUND_PRESETS } from './presets';
import { readUiSoundPreferences } from './prefs';

let audioCtx: AudioContext | null = null;
const lastPlayedAt = new Map<UiSoundEvent, number>();

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

async function resumeAudioContext(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* noop */
    }
  }
}

function scheduleTone(ctx: AudioContext, tone: UiSoundToneSpec, startAt: number, gainScale: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tone.wave;
  osc.frequency.value = tone.freqHz;
  const toneDur = Math.max(0.01, tone.durationMs / 1000);
  const attack = Math.min(0.015, toneDur * 0.4);
  const release = Math.min(0.03, toneDur * 0.6);
  const peak = Math.max(0, Math.min(1, tone.gain * gainScale));
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + toneDur + release);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + toneDur + release + 0.005);
}

export async function playUiSound(event: UiSoundEvent): Promise<void> {
  const prefs = readUiSoundPreferences();
  if (!prefs.enabled || prefs.volume <= 0) return;

  const preset = UI_SOUND_PRESETS[event];
  const nowMs = Date.now();
  const minInterval = preset.minIntervalMs ?? 0;
  const last = lastPlayedAt.get(event) ?? 0;
  if (nowMs - last < minInterval) return;
  lastPlayedAt.set(event, nowMs);

  const ctx = getAudioContext();
  if (!ctx) return;
  await resumeAudioContext(ctx);
  const baseGain = (prefs.volume / 100) * (preset.eventGain ?? 1);
  const gapSeconds = (preset.gapMs ?? 0) / 1000;
  let cursor = ctx.currentTime;
  for (const tone of preset.tones) {
    scheduleTone(ctx, tone, cursor, baseGain);
    cursor += tone.durationMs / 1000 + gapSeconds;
  }
}
