import {
  ACCESSIBILITY_PREFS_STORAGE_KEY,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  applyAccessibilityPreferencesToDocument,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
} from '@/lib/accessibilityPreferences';

describe('accessibilityPreferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-a11y-reduce-motion');
    document.documentElement.removeAttribute('data-a11y-increase-contrast');
    document.documentElement.removeAttribute('data-a11y-bold-text');
    document.documentElement.removeAttribute('data-a11y-reduce-transparency');
    document.documentElement.removeAttribute('data-a11y-differentiate-without-color');
    document.documentElement.removeAttribute('data-a11y-onoff-labels');
    document.documentElement.removeAttribute('data-a11y-button-shapes');
    document.documentElement.removeAttribute('data-a11y-grayscale');
    document.documentElement.removeAttribute('data-a11y-dim-flashing-lights');
    document.documentElement.removeAttribute('data-a11y-prefer-non-blinking-cursor');
    document.documentElement.style.removeProperty('--a11y-font-scale');
  });

  it('loads defaults when storage is empty', () => {
    expect(loadAccessibilityPreferences()).toEqual(DEFAULT_ACCESSIBILITY_PREFERENCES);
  });

  it('saves and loads preferences from localStorage', () => {
    const next = {
      ...DEFAULT_ACCESSIBILITY_PREFERENCES,
      reduceMotion: true,
      largerText: 'xlarge' as const,
      grayscale: true,
    };
    saveAccessibilityPreferences(next);

    const raw = window.localStorage.getItem(ACCESSIBILITY_PREFS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(loadAccessibilityPreferences()).toEqual(next);
  });

  it('applies attributes and text scale to document', () => {
    const next = {
      ...DEFAULT_ACCESSIBILITY_PREFERENCES,
      reduceMotion: true,
      increaseContrast: true,
      boldText: true,
      onOffLabels: true,
      largerText: 'large' as const,
    };

    applyAccessibilityPreferencesToDocument(next);

    expect(document.documentElement.getAttribute('data-a11y-reduce-motion')).toBe('1');
    expect(document.documentElement.getAttribute('data-a11y-increase-contrast')).toBe('1');
    expect(document.documentElement.getAttribute('data-a11y-bold-text')).toBe('1');
    expect(document.documentElement.getAttribute('data-a11y-onoff-labels')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--a11y-font-scale')).toBe('1.07');
  });
});
