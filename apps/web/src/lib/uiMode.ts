export type UiMode = 'millennial' | 'gen_z';

export const UI_MODE_STORAGE_KEY = 'campsite_ui_mode';
export const UI_MODE_EVENT = 'campsite:ui-mode-change';

export function normalizeUiMode(value: string | null | undefined): UiMode {
  return value === 'gen_z' ? 'gen_z' : 'millennial';
}

export function nextUiMode(current: UiMode): UiMode {
  return current === 'gen_z' ? 'millennial' : 'gen_z';
}
