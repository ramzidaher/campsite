export type PushTokenPlatform = 'web' | 'ios' | 'android';

export type ParsePushTokenBodyResult =
  | { ok: true; token: string; platform: PushTokenPlatform }
  | { ok: false; status: number; error: string };

const PLATFORMS: ReadonlySet<string> = new Set(['web', 'ios', 'android']);

/**
 * Validates JSON body for `POST /api/push-token`. Caller maps `{ ok: false }` to HTTP responses.
 */
export function parsePushTokenBody(raw: unknown): ParsePushTokenBodyResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, status: 400, error: 'Invalid JSON' };
  }
  const o = raw as Record<string, unknown>;
  const token = typeof o.token === 'string' ? o.token.trim() : '';
  if (!token) {
    return { ok: false, status: 400, error: 'token required' };
  }
  const p = o.platform;
  const platform: PushTokenPlatform =
    typeof p === 'string' && PLATFORMS.has(p) ? (p as PushTokenPlatform) : 'web';
  return { ok: true, token, platform };
}
