import type { UiSoundPreset } from '@campsite/types';

const SAMPLE_RATE = 22050;

function waveSample(
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth',
  phase: number,
): number {
  const p = phase % 1;
  switch (wave) {
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'sawtooth':
      return 2 * p - 1;
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'sine':
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

function base64FromBytes(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    out += alphabet[(triplet >> 18) & 63];
    out += alphabet[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[triplet & 63] : '=';
  }
  return out;
}

export function synthPresetToWavDataUri(preset: UiSoundPreset, gainScale: number): string {
  const gapMs = Math.max(0, preset.gapMs ?? 0);
  const totalMs =
    preset.tones.reduce((sum, tone) => sum + Math.max(1, tone.durationMs), 0) +
    Math.max(0, preset.tones.length - 1) * gapMs;
  const totalSamples = Math.max(1, Math.floor((totalMs / 1000) * SAMPLE_RATE));
  const pcm = new Int16Array(totalSamples);
  let cursor = 0;
  for (const tone of preset.tones) {
    const toneSamples = Math.max(1, Math.floor((tone.durationMs / 1000) * SAMPLE_RATE));
    const attack = Math.max(1, Math.floor(toneSamples * 0.2));
    const release = Math.max(1, Math.floor(toneSamples * 0.3));
    let phase = 0;
    const phaseStep = tone.freqHz / SAMPLE_RATE;
    for (let i = 0; i < toneSamples && cursor + i < pcm.length; i += 1) {
      const attackGain = i < attack ? i / attack : 1;
      const releaseGain = i > toneSamples - release ? (toneSamples - i) / release : 1;
      const env = Math.max(0, Math.min(1, attackGain * releaseGain));
      const sample =
        waveSample(tone.wave, phase) * tone.gain * gainScale * env;
      const n = Math.max(-1, Math.min(1, sample));
      pcm[cursor + i] = Math.floor(n * 32767);
      phase += phaseStep;
    }
    cursor += toneSamples + Math.floor((gapMs / 1000) * SAMPLE_RATE);
  }

  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (const s of pcm) {
    view.setInt16(off, s, true);
    off += 2;
  }
  const bytes = new Uint8Array(buffer);
  return `data:audio/wav;base64,${base64FromBytes(bytes)}`;
}
