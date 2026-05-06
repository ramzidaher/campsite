const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 3000;

export function getSupabaseFetchTimeoutMs(): number {
  const raw = Number.parseInt(process.env.SUPABASE_FETCH_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_SUPABASE_FETCH_TIMEOUT_MS;
}

/**
 * Short-circuit slow Supabase network calls so app routes fail fast
 * instead of hanging the full request path.
 */
export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  timeoutMs: number = getSupabaseFetchTimeoutMs(),
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(input, init);
  }

  const timeoutController = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    timeoutController.abort();
  }, timeoutMs);

  // Respect any caller-provided signal while still enforcing our timeout.
  const combinedSignal =
    init?.signal != null
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

  try {
    return await fetch(input, { ...init, signal: combinedSignal });
  } catch (error) {
    if (didTimeout) {
      throw new Error(`supabase_fetch_timeout_after_${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
