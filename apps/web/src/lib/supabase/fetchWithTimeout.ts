const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 3000;
const DEFAULT_SUPABASE_AUTH_FETCH_TIMEOUT_MS = 8000;

export function getSupabaseAuthFetchTimeoutMs(): number {
  const raw = Number.parseInt(process.env.SUPABASE_AUTH_FETCH_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_SUPABASE_AUTH_FETCH_TIMEOUT_MS;
}

function resolveSupabaseTimeoutMs(input: Parameters<typeof fetch>[0], timeoutMs: number): number {
  // Auth refresh/getUser calls are more sensitive to transient network jitter.
  // Keep stricter defaults for general RPC/data fetches, but allow auth a wider window
  // so users are not logged out during brief stalls.
  if (typeof input === 'string' && input.includes('/auth/v1/')) {
    return Math.max(timeoutMs, getSupabaseAuthFetchTimeoutMs());
  }
  if (input instanceof URL && input.pathname.includes('/auth/v1/')) {
    return Math.max(timeoutMs, getSupabaseAuthFetchTimeoutMs());
  }
  if (input instanceof Request && input.url.includes('/auth/v1/')) {
    return Math.max(timeoutMs, getSupabaseAuthFetchTimeoutMs());
  }
  return timeoutMs;
}

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
  const effectiveTimeoutMs = resolveSupabaseTimeoutMs(input, timeoutMs);
  const timeoutErrorMessage = `supabase_fetch_timeout_after_${effectiveTimeoutMs}ms`;
  const abortController = new AbortController();
  const parentSignal = init?.signal;
  let timedOut = false;

  const onParentAbort = () => {
    // Preserve caller-triggered cancellation semantics.
    abortController.abort((parentSignal as AbortSignal).reason);
  };

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortController.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: abortController.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutErrorMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
    if (parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
}
