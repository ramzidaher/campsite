export const UI_SOUND_EVENTS = [
  'menu_open',
  'menu_close',
  'dropdown_open',
  'dropdown_close',
  'toggle_on',
  'toggle_off',
  'broadcast_draft_saved',
  'broadcast_submitted',
  'broadcast_sent',
  'broadcast_scheduled',
  'recruitment_read',
  'recruitment_mark_all_read',
  'error_soft',
] as const;

export type UiSoundEvent = (typeof UI_SOUND_EVENTS)[number];

export type UiSoundToneSpec = {
  freqHz: number;
  durationMs: number;
  gain: number;
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
};

export type UiSoundPreset = {
  tones: UiSoundToneSpec[];
  gapMs?: number;
  /** Per-event gain multiplier before user volume is applied. */
  eventGain?: number;
  /** Prevent repeated triggering of the same event in quick succession. */
  minIntervalMs?: number;
};
