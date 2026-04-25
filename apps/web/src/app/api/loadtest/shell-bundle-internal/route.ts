import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import {
  getMainShellLayoutBundleForViewer,
  getStaleOrDefaultShellBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import { parseShellBadgeCounts } from '@/lib/shell/shellBadgeCounts';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '@/lib/supabase/env';

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

function equalSecret(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function createServiceRoleRpcClient() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJsClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function logInternalRouteEvent(params: {
  userId: string;
  orgId: string;
  cacheStatus: string;
  durationMs: number;
  timeoutFallbackUsed: boolean;
  responseStatus: number;
  shellDegraded: boolean;
}) {
  console.info(
    JSON.stringify({
      event: 'loadtest_shell_bundle_internal_response',
      ...params,
    })
  );
}

export async function GET(req: Request) {
  const startedAt = Date.now();

  const configuredSecret = process.env.LOADTEST_SECRET ?? '';
  const providedSecret = req.headers.get('x-loadtest-secret')?.trim() ?? '';
  if (!configuredSecret) {
    return NextResponse.json({ error: 'loadtest_secret_not_configured' }, { status: 404 });
  }
  if (!providedSecret || !equalSecret(providedSecret, configuredSecret)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const loadtestUserId = req.headers.get('x-loadtest-user-id')?.trim() ?? '';
  const loadtestOrgId = req.headers.get('x-loadtest-org-id')?.trim() ?? '';
  if (!loadtestUserId || !loadtestOrgId) {
    return NextResponse.json({ error: 'missing_loadtest_context' }, { status: 400 });
  }

  const supabase = createServiceRoleRpcClient();
  if (!supabase) {
    return NextResponse.json({ error: 'supabase_unavailable' }, { status: 500 });
  }

  // Cache/coalescing key for load tests is explicitly scoped to synthetic user+org context.
  const viewerKey = `${loadtestOrgId}:${loadtestUserId}`;
  let timeoutFallbackUsed = false;
  let bundle: Record<string, unknown>;
  try {
    const resolved = await withTimeout(
      getMainShellLayoutBundleForViewer(supabase, viewerKey, {
        structuralRpcName: 'main_shell_layout_structural_for_user',
        structuralRpcArgs: { p_user_id: loadtestUserId },
        badgeRpcName: 'main_shell_badge_counts_bundle_for_user',
        badgeRpcArgs: { p_user_id: loadtestUserId },
      }),
      APP_ROUTE_TIMEOUT_MS
    );
    bundle = resolved.value;
  } catch {
    timeoutFallbackUsed = true;
    bundle = {
      ...getStaleOrDefaultShellBundle(viewerKey),
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

  const responsePayload = {
    structural: structuralData,
    badges: badgeData,
    shell_response_cache_status: bundle.shell_response_cache_status ?? 'unknown',
    shell_response_cache_age_ms: bundle.shell_response_cache_age_ms ?? null,
    shell_cache_status: bundle.shell_cache_status ?? 'unknown',
    shell_degraded: Boolean(bundle.shell_degraded),
    shell_guardrail_reasons: Array.isArray(bundle.shell_guardrail_reasons) ? bundle.shell_guardrail_reasons : [],
    auth_validation_source: 'loadtest_internal_bypass',
    auth_remote_user_calls: 0,
    auth_remote_user_failures: 0,
  };
  const response = NextResponse.json(responsePayload, { headers: { 'Cache-Control': 'no-store' } });

  logInternalRouteEvent({
    userId: loadtestUserId,
    orgId: loadtestOrgId,
    cacheStatus:
      typeof responsePayload.shell_response_cache_status === 'string'
        ? responsePayload.shell_response_cache_status
        : 'unknown',
    durationMs: Date.now() - startedAt,
    timeoutFallbackUsed,
    responseStatus: response.status,
    shellDegraded: responsePayload.shell_degraded,
  });
  return response;
}

