'use client';

import { useEffect, useState } from 'react';
import {
  UI_MODE_EVENT,
  UI_MODE_STORAGE_KEY,
  normalizeUiMode,
  type UiMode,
} from '@/lib/uiMode';

export function useUiModePreference(initialMode: UiMode | string | null | undefined) {
  const [uiMode, setUiMode] = useState<UiMode>(normalizeUiMode(initialMode));

  useEffect(() => {
    const sync = () => {
      try {
        const saved = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
        if (saved) setUiMode(normalizeUiMode(saved));
        else setUiMode(normalizeUiMode(initialMode));
      } catch {
        setUiMode(normalizeUiMode(initialMode));
      }
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(UI_MODE_EVENT, sync as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(UI_MODE_EVENT, sync as EventListener);
    };
  }, [initialMode]);

  const updateUiMode = (mode: UiMode) => {
    setUiMode(mode);
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new CustomEvent(UI_MODE_EVENT, { detail: { mode } }));
  };

  return { uiMode, updateUiMode };
}
