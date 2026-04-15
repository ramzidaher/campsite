'use client';

import { UI_MODE_EVENT, UI_MODE_STORAGE_KEY, normalizeUiMode, type UiMode } from '@/lib/uiMode';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function ProfileUiModeSync({ initialMode }: { initialMode: UiMode }) {
  const router = useRouter();
  const lastModeRef = useRef<UiMode>(initialMode);

  useEffect(() => {
    lastModeRef.current = initialMode;
  }, [initialMode]);

  useEffect(() => {
    const syncFromStorage = () => {
      let nextMode: UiMode = initialMode;
      try {
        nextMode = normalizeUiMode(window.localStorage.getItem(UI_MODE_STORAGE_KEY));
      } catch {
        nextMode = initialMode;
      }
      if (nextMode === lastModeRef.current) return;
      lastModeRef.current = nextMode;
      router.refresh();
    };

    window.addEventListener(UI_MODE_EVENT, syncFromStorage as EventListener);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(UI_MODE_EVENT, syncFromStorage as EventListener);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, [initialMode, router]);

  return null;
}
