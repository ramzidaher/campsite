'use client';

import { useEffect } from 'react';
import {
  ACCESSIBILITY_PREFS_EVENT,
  applyAccessibilityPreferencesToDocument,
  loadAccessibilityPreferences,
} from '@/lib/accessibilityPreferences';

export function AccessibilityPreferencesSync() {
  useEffect(() => {
    const sync = () => {
      const prefs = loadAccessibilityPreferences();
      applyAccessibilityPreferencesToDocument(prefs);
    };

    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(ACCESSIBILITY_PREFS_EVENT, sync as EventListener);

    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(ACCESSIBILITY_PREFS_EVENT, sync as EventListener);
    };
  }, []);

  return null;
}
