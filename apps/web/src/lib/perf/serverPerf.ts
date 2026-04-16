const PERF_WARN_THRESHOLD_MS = 1200;
const PERF_WARN_OP_THRESHOLD_MS = 450;

export function warnIfSlowServerPath(path: string, startedAtMs: number) {
  const elapsedMs = Date.now() - startedAtMs;
  if (elapsedMs < PERF_WARN_THRESHOLD_MS) return;
  // Keep logs compact and machine-searchable for incident timelines.
  console.warn(`[perf][server][slow_path] path=${path} duration_ms=${elapsedMs}`);
}

export async function withServerPerf<T>(
  path: string,
  op: string,
  task: PromiseLike<T>,
  warnThresholdMs: number = PERF_WARN_OP_THRESHOLD_MS,
): Promise<T> {
  const startedAtMs = Date.now();
  const result = await Promise.resolve(task);
  const elapsedMs = Date.now() - startedAtMs;
  if (elapsedMs >= warnThresholdMs) {
    console.warn(`[perf][server][slow_op] path=${path} op=${op} duration_ms=${elapsedMs}`);
  }
  return result;
}

