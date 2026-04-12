'use client';

import {
  CAMPFIRE_PREFS_CHANGED_EVENT,
  readAmbientCampfirePreferences,
} from '@/lib/sound/ambientCampfirePrefs';
import { setCampfireAmbientActive } from '@/lib/sound/campfireAmbient';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/** Procedural campfire loop while viewing the main dashboard home (optional preference). */
export function DashboardCampfireAmbient() {
  const pathname = usePathname();
  const onDashboard = pathname === '/dashboard';

  useEffect(() => {
    if (!onDashboard) {
      setCampfireAmbientActive(false, 0);
      return;
    }
    const apply = () => {
      const p = readAmbientCampfirePreferences();
      setCampfireAmbientActive(p.enabled, p.volume);
    };
    apply();
    window.addEventListener(CAMPFIRE_PREFS_CHANGED_EVENT, apply);
    window.addEventListener('storage', apply);
    return () => {
      window.removeEventListener(CAMPFIRE_PREFS_CHANGED_EVENT, apply);
      window.removeEventListener('storage', apply);
      setCampfireAmbientActive(false, 0);
    };
  }, [onDashboard]);

  return null;
}
