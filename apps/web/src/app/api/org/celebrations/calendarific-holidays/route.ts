import {
  calendarificMigrationHint,
  fetchOrgCelebrationFields,
  isMissingCalendarificHolidaysCacheError,
} from '@/lib/calendarific/orgCelebrationDb';
import { buildPreviewRows } from '@/lib/calendarific/syncCelebrationHolidays';
import type { CalendarificHoliday } from '@/lib/calendarific/types';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
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
  const orgLastSyncedAt = orgFields.fields.celebration_holidays_last_synced_at;

  const y0 = new Date().getFullYear();
  const y1 = y0 + 1;

  const { data: rows, error: cErr } = await admin
    .from('calendarific_holidays_cache')
    .select('year, holidays, fetched_at')
    .eq('country', country)
    .in('year', [y0, y1]);

  if (cErr) {
    if (isMissingCalendarificHolidaysCacheError(cErr)) {
      return NextResponse.json({
        country,
        years: [y0, y1],
        holidays: [],
        cacheRows: 0,
        lastFetchedAt: null,
        orgLastSyncedAt,
        needsSync: true,
        migrationPending: true,
        ...calendarificMigrationHint(),
      });
    }
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const merged: CalendarificHoliday[] = [];
  let oldestFetch: string | null = null;
  for (const r of rows ?? []) {
    const list = r.holidays as CalendarificHoliday[] | null;
    if (Array.isArray(list)) merged.push(...list);
    const fa = r.fetched_at as string | null;
    if (fa && (!oldestFetch || fa < oldestFetch)) oldestFetch = fa;
  }

  return NextResponse.json({
    country,
    years: [y0, y1],
    holidays: buildPreviewRows(merged),
    cacheRows: (rows ?? []).length,
    lastFetchedAt: oldestFetch,
    orgLastSyncedAt,
    needsSync: (rows ?? []).length < 2,
  });
}
