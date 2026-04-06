import type { UiSoundEvent, UiSoundPreset } from '@campsite/types';

const click = (freqHz: number, wave: UiSoundPreset['tones'][number]['wave'] = 'triangle') => ({
  freqHz,
  durationMs: 70,
  gain: 0.22,
  wave,
});

export const UI_SOUND_PRESETS: Record<UiSoundEvent, UiSoundPreset> = {
  menu_open: { tones: [click(700), click(920)], gapMs: 18, eventGain: 0.8, minIntervalMs: 70 },
  menu_close: { tones: [click(860), click(640)], gapMs: 18, eventGain: 0.72, minIntervalMs: 70 },
  dropdown_open: { tones: [click(680), click(820)], gapMs: 14, eventGain: 0.7, minIntervalMs: 70 },
  dropdown_close: { tones: [click(820), click(640)], gapMs: 14, eventGain: 0.65, minIntervalMs: 70 },
  toggle_on: { tones: [click(610), click(780)], gapMs: 16, eventGain: 0.68, minIntervalMs: 60 },
  toggle_off: { tones: [click(760), click(590)], gapMs: 16, eventGain: 0.62, minIntervalMs: 60 },
  broadcast_draft_saved: {
    tones: [click(520, 'sine'), click(650, 'sine')],
    gapMs: 22,
    eventGain: 0.8,
    minIntervalMs: 120,
  },
  broadcast_submitted: {
    tones: [click(620, 'sine'), click(780, 'sine'), click(980, 'triangle')],
    gapMs: 22,
    eventGain: 0.92,
    minIntervalMs: 160,
  },
  broadcast_sent: {
    tones: [click(640, 'sine'), click(850, 'sine'), click(1080, 'triangle')],
    gapMs: 22,
    eventGain: 1,
    minIntervalMs: 180,
  },
  broadcast_scheduled: {
    tones: [click(560, 'sine'), click(710, 'sine'), click(880, 'triangle')],
    gapMs: 24,
    eventGain: 0.9,
    minIntervalMs: 180,
  },
  recruitment_read: { tones: [click(720)], eventGain: 0.52, minIntervalMs: 70 },
  recruitment_mark_all_read: { tones: [click(600), click(740), click(860)], gapMs: 18, eventGain: 0.76, minIntervalMs: 150 },
  error_soft: {
    tones: [
      { freqHz: 320, durationMs: 84, gain: 0.2, wave: 'triangle' },
      { freqHz: 260, durationMs: 110, gain: 0.2, wave: 'triangle' },
    ],
    gapMs: 16,
    eventGain: 0.82,
    minIntervalMs: 120,
  },
};
