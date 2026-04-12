import { ensureAudioContextReady } from './player';

type StopFn = () => void;

let active: { stop: StopFn } | null = null;
let lastAppliedKey = '';
let requestId = 0;

function buildBrownNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.014 * white) * 0.993;
    data[i] = last * 3.1;
  }
  return buffer;
}

function playCrackleBurst(ctx: AudioContext, master: GainNode): void {
  const t = ctx.currentTime;
  const dur = 0.035 + Math.random() * 0.055;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  const f0 = 2200 + Math.random() * 1600;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(380 + Math.random() * 220, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.08, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/**
 * Loops a soft brown-noise bed with occasional crackles. Stops any previous instance.
 * `volume` is 0–100 (not tied to UI SFX mute — ambient has its own toggle).
 */
export function setCampfireAmbientActive(enabled: boolean, volume: number): void {
  if (!enabled || volume <= 0) {
    requestId += 1;
    active?.stop();
    active = null;
    lastAppliedKey = '';
    return;
  }

  const key = `${volume}`;
  if (key === lastAppliedKey && active) return;

  requestId += 1;
  const rid = requestId;
  active?.stop();
  active = null;
  lastAppliedKey = key;

  void (async () => {
    const ctx = await ensureAudioContextReady();
    if (rid !== requestId || !ctx) return;

    const master = ctx.createGain();
    master.gain.value = (volume / 100) * 0.11;
    master.connect(ctx.destination);

    const buf = buildBrownNoiseBuffer(ctx, 2.8);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 720;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 95;
    src.connect(lp);
    lp.connect(hp);
    hp.connect(master);
    src.start();

    const tick = () => {
      if (Math.random() < 0.62) playCrackleBurst(ctx, master);
    };
    const id = window.setInterval(tick, 160 + Math.random() * 380);

    const stop: StopFn = () => {
      window.clearInterval(id);
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
        lp.disconnect();
        hp.disconnect();
        master.disconnect();
      } catch {
        /* noop */
      }
      if (active?.stop === stop) {
        active = null;
        lastAppliedKey = '';
      }
    };

    if (rid === requestId) active = { stop };
  })();
}
