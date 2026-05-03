/**
 * Do Not Disturb quiet hours (local timezone), matching profiles.dnd_* semantics.
 */

export function normalizeLocalTimeInput(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length < 2) return null;
  const h = Math.min(23, Math.max(0, parseInt(parts[0]!, 10)));
  const m = Math.min(59, Math.max(0, parseInt(parts[1]!, 10)));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(t: string): number {
  const n = normalizeLocalTimeInput(t);
  if (!n) return 0;
  const [h, m] = n.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export function localMinutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** True when quiet hours are enabled and `now` falls inside the configured window. */
export function isDoNotDisturbWindowActive(
  enabled: boolean,
  start: string | null | undefined,
  end: string | null | undefined,
  now = new Date()
): boolean {
  if (!enabled) return false;
  const s = normalizeLocalTimeInput(start ?? null);
  const e = normalizeLocalTimeInput(end ?? null);
  if (!s || !e) return false;
  const startM = timeToMinutes(s);
  const endM = timeToMinutes(e);
  if (startM === endM) return false;
  const nowM = localMinutesSinceMidnight(now);
  if (startM < endM) {
    return nowM >= startM && nowM < endM;
  }
  return nowM >= startM || nowM < endM;
}
