import { isDoNotDisturbWindowActive } from '@/lib/doNotDisturb';

type Mirror = {
  enabled: boolean;
  start: string | null;
  end: string | null;
};

let mirror: Mirror = {
  enabled: false,
  start: null,
  end: null,
};

/** Called from AppTopBar when shell props or user toggles DND. */
export function setDndScheduleMirror(next: Mirror): void {
  mirror = { ...next };
}

export function getDndScheduleMirror(): Mirror {
  return mirror;
}

/** Used by UI sound player to respect quiet hours without async profile reads. */
export function isDndScheduleSuppressingUiSoundsNow(now = new Date()): boolean {
  return isDoNotDisturbWindowActive(mirror.enabled, mirror.start, mirror.end, now);
}
