import { invalidateShellCachesForOrg } from '@/lib/cache/cacheInvalidation';
import {
  calendarificMigrationHint,
  fetchOrgCelebrationFields,
  isMissingCalendarificHolidaysCacheError,
} from '@/lib/calendarific/orgCelebrationDb';
import { syncCelebrationHolidaysForOrg } from '@/lib/calendarific/syncCelebrationHolidays';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.CALENDARIFIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Calendarific is not configured (missing CALENDARIFIC_API_KEY).' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (meErr || !me?.org_id || me.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const orgId = me.org_id as string;

  const { data: can } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'roles.manage',
    p_context: {},
  });
  if (!can) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { forceRefreshCache?: boolean } = {};
  try {
    body = (await req.json()) as { forceRefreshCache?: boolean };
  } catch {
    body = {};
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'Server misconfigured (service role).' }, { status: 503 });
  }

  const orgFields = await fetchOrgCelebrationFields(admin, orgId);
  if (!orgFields.ok) {
    return NextResponse.json({ error: orgFields.error }, { status: 400 });
  }
  const country = orgFields.fields.celebration_holiday_country;

  const probe = await admin.from('calendarific_holidays_cache').select('country').limit(1);
  if (probe.error) {
    if (isMissingCalendarificHolidaysCacheError(probe.error)) {
      return NextResponse.json(
        {
          error:
            'Calendarific cache table is missing. Apply the database migration before syncing public holidays.',
          ...calendarificMigrationHint(),
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: probe.error.message }, { status: 500 });
  }

  const anchorYear = new Date().getFullYear();
  const result = await syncCelebrationHolidaysForOrg({
    admin,
    orgId,
    country,
    apiKey,
    anchorYear,
    forceRefreshCache: Boolean(body.forceRefreshCache),
    signal: req.signal,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await invalidateShellCachesForOrg(orgId);
  return NextResponse.json(result);
}
