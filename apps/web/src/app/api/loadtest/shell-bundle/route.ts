import { NextResponse } from 'next/server';

import { createSupabaseForApiRequest, getUserFromApiRequestWithReason } from '@/lib/supabase/apiRouteAuth';
import {
  getMainShellLayoutBundleForViewer,
  getStaleOrDefaultShellBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';

export const dynamic = 'force-dynamic';

const BADGE_KEYS = new Set([
  'broadcast_unread',
  'broadcast_pending_approvals',
  'recruitment_notifications',
  'application_notifications',
  'leave_notifications',
  'hr_metric_notifications',
  'calendar_event_notifications',
  'pending_approvals',
  'leave_pending_approval',
  'recruitment_pending_review',
  'performance_pending',
  'onboarding_active',
  'rota_pending_final',
  'rota_pending_peer',
]);

const META_KEYS = new Set([
  'shell_response_cache_status',
  'shell_response_cache_age_ms',
  'shell_cache_status',
  'shell_degraded',
  'shell_guardrail_reasons',
]);

const APP_ROUTE_TIMEOUT_MS = Number.parseInt(process.env.CAMPSITE_SHELL_APP_ROUTE_TIMEOUT_MS ?? '4000', 10);

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    const value = await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`app_route_timeout_after_${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    return { value, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function logRouteEvent(params: {
  userId: string;
  cacheStatus: string;
  durationMs: number;
  timeoutFallbackUsed: boolean;
  responseStatus: number;
  authReason: string;
  hasAuthorizationHeader: boolean;
  authErrorCode: string | null;
  authErrorMessage: string | null;
  jwtExpUnix: number | null;
  serverNowUnix: number;
  secondsUntilExpiry: number | null;
}) {
  console.info(
    JSON.stringify({
      event: 'loadtest_shell_bundle_response',
      ...params,
    })
  );
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const authResult = await getUserFromApiRequestWithReason(req);
  if (!authResult.user) {
    console.warn(
      JSON.stringify({
        event: 'loadtest_shell_bundle_auth_failure',
        reason: authResult.reason,
        hasAuthorizationHeader: authResult.hasAuthorizationHeader,
        authErrorCode: authResult.authErrorCode,
        authErrorMessage: authResult.authErrorMessage,
        jwtExpUnix: authResult.jwtExpUnix,
        serverNowUnix: authResult.serverNowUnix,
        secondsUntilExpiry: authResult.secondsUntilExpiry,
      })
    );
    return NextResponse.json(
      {
        error: 'unauthorized',
        auth_reason: authResult.reason,
        auth_error_code: authResult.authErrorCode,
        auth_error_message: authResult.authErrorMessage,
        jwt_exp_unix: authResult.jwtExpUnix,
        server_now_unix: authResult.serverNowUnix,
        seconds_until_expiry: authResult.secondsUntilExpiry,
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) {
    return NextResponse.json({ error: 'supabase_unavailable' }, { status: 500 });
  }

  const viewerKey = authResult.user.id;
  let timeoutFallbackUsed = false;
  let bundle: Record<string, unknown>;
  try {
    const resolved = await withTimeout(
      getMainShellLayoutBundleForViewer(supabase, viewerKey),
      APP_ROUTE_TIMEOUT_MS
    );
    bundle = resolved.value;
  } catch {
    timeoutFallbackUsed = true;
    bundle = getStaleOrDefaultShellBundle(viewerKey);
    bundle = {
      ...bundle,
      shell_degraded: true,
      shell_degraded_reason: 'app_timeout_fallback',
    };
  }

  const badgeData = parseShellBadgeCounts(bundle);
  const structuralData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bundle)) {
    if (BADGE_KEYS.has(key)) continue;
    if (META_KEYS.has(key)) continue;
    structuralData[key] = value;
  }

  const response = NextResponse.json(
    {
      structural: structuralData,
      badges: badgeData,
      shell_response_cache_status: bundle.shell_response_cache_status ?? 'unknown',
      shell_response_cache_age_ms: bundle.shell_response_cache_age_ms ?? null,
      shell_cache_status: bundle.shell_cache_status ?? 'unknown',
      shell_degraded: Boolean(bundle.shell_degraded),
      shell_guardrail_reasons: Array.isArray(bundle.shell_guardrail_reasons)
        ? bundle.shell_guardrail_reasons
        : [],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  logRouteEvent({
    userId: viewerKey,
    cacheStatus:
      typeof bundle.shell_response_cache_status === 'string' ? bundle.shell_response_cache_status : 'unknown',
    durationMs: Date.now() - startedAt,
    timeoutFallbackUsed,
    responseStatus: response.status,
    authReason: authResult.reason,
    hasAuthorizationHeader: authResult.hasAuthorizationHeader,
    authErrorCode: authResult.authErrorCode,
    authErrorMessage: authResult.authErrorMessage,
    jwtExpUnix: authResult.jwtExpUnix,
    serverNowUnix: authResult.serverNowUnix,
    secondsUntilExpiry: authResult.secondsUntilExpiry,
  });
  return response;
}
