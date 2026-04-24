import { NextResponse } from 'next/server';

import { getUserFromApiRequest, createSupabaseForApiRequest } from '@/lib/supabase/apiRouteAuth';
import { getMainShellLayoutBundleForViewer } from '@/lib/supabase/cachedMainShellLayoutBundle';
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

export async function GET(req: Request) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = await createSupabaseForApiRequest(req);
  if (!supabase) {
    return NextResponse.json({ error: 'supabase_unavailable' }, { status: 500 });
  }

  const bundle = await getMainShellLayoutBundleForViewer(supabase, user.id);
  const badgeData = parseShellBadgeCounts(bundle);
  const structuralData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bundle)) {
    if (BADGE_KEYS.has(key)) continue;
    if (META_KEYS.has(key)) continue;
    structuralData[key] = value;
  }

  return NextResponse.json(
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
}
