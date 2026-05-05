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
  return Promise.race([
    fetch(input, init),
    new Promise<Response>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`supabase_fetch_timeout_after_${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}
