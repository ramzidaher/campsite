'use client';

import { useEffect } from 'react';
import { playUiSound } from '@/lib/sound/player';

/**
 * Plays checkbox_check / checkbox_uncheck for native checkboxes unless opted out via
 * `data-no-checkbox-sound` on the input or an ancestor.
 */
export function CheckboxUiSoundCapture() {
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type !== 'checkbox') return;
      if (t.disabled) return;
      if (t.hasAttribute('data-no-checkbox-sound') || t.closest('[data-no-checkbox-sound]')) return;
      void playUiSound(t.checked ? 'checkbox_check' : 'checkbox_uncheck');
    };
    document.addEventListener('change', onChange, true);
    return () => document.removeEventListener('change', onChange, true);
  }, []);

  return null;
}
