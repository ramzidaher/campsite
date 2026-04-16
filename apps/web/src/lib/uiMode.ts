export type UiMode = 'classic' | 'interactive';

export const UI_MODE_STORAGE_KEY = 'campsite_ui_mode';
export const UI_MODE_EVENT = 'campsite:ui-mode-change';

export function normalizeUiMode(value: string | null | undefined): UiMode {
  return value === 'interactive' || value === 'gen_z' ? 'interactive' : 'classic';
}

export function nextUiMode(current: UiMode): UiMode {
  return current === 'interactive' ? 'classic' : 'interactive';
}
