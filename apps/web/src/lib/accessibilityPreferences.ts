export type AccessibilityTextSize = 'default' | 'large' | 'xlarge';

export type AccessibilityPreferences = {
  reduceMotion: boolean;
  increaseContrast: boolean;
  largerText: AccessibilityTextSize;
  boldText: boolean;
  reduceTransparency: boolean;
  differentiateWithoutColor: boolean;
  onOffLabels: boolean;
  buttonShapes: boolean;
  grayscale: boolean;
  dimFlashingLights: boolean;
  preferNonBlinkingCursor: boolean;
};

export const ACCESSIBILITY_PREFS_STORAGE_KEY = 'campsite_accessibility_preferences_v1';
export const ACCESSIBILITY_PREFS_EVENT = 'campsite:accessibility-preferences-change';

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  reduceMotion: false,
  increaseContrast: false,
  largerText: 'default',
  boldText: false,
  reduceTransparency: false,
  differentiateWithoutColor: false,
  onOffLabels: false,
  buttonShapes: false,
  grayscale: false,
  dimFlashingLights: false,
  preferNonBlinkingCursor: false,
};

function readRaw(): Partial<AccessibilityPreferences> | null {
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadAccessibilityPreferences(): AccessibilityPreferences {
  if (typeof window === 'undefined') return DEFAULT_ACCESSIBILITY_PREFERENCES;
  const parsed = readRaw();
  return {
    ...DEFAULT_ACCESSIBILITY_PREFERENCES,
    ...(parsed ?? {}),
  };
}

export function saveAccessibilityPreferences(next: AccessibilityPreferences) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCESSIBILITY_PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode/quota etc)
  }
  window.dispatchEvent(new CustomEvent(ACCESSIBILITY_PREFS_EVENT, { detail: next }));
}

function setFlag(name: string, value: boolean) {
  if (typeof document === 'undefined') return;
  if (value) document.documentElement.setAttribute(name, '1');
  else document.documentElement.removeAttribute(name);
}

export function applyAccessibilityPreferencesToDocument(prefs: AccessibilityPreferences) {
  if (typeof document === 'undefined') return;

  setFlag('data-a11y-reduce-motion', prefs.reduceMotion);
  setFlag('data-a11y-increase-contrast', prefs.increaseContrast);
  setFlag('data-a11y-bold-text', prefs.boldText);
  setFlag('data-a11y-reduce-transparency', prefs.reduceTransparency);
  setFlag('data-a11y-differentiate-without-color', prefs.differentiateWithoutColor);
  setFlag('data-a11y-onoff-labels', prefs.onOffLabels);
  setFlag('data-a11y-button-shapes', prefs.buttonShapes);
  setFlag('data-a11y-grayscale', prefs.grayscale);
  setFlag('data-a11y-dim-flashing-lights', prefs.dimFlashingLights);
  setFlag('data-a11y-prefer-non-blinking-cursor', prefs.preferNonBlinkingCursor);

  const scale = prefs.largerText === 'xlarge' ? '1.14' : prefs.largerText === 'large' ? '1.07' : '1';
  document.documentElement.style.setProperty('--a11y-font-scale', scale);
}
