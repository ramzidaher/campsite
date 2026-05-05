import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDARIFIC_CACHE_MIGRATION =
  'supabase/migrations/20260804120000_calendarific_celebration_cache.sql';

/** PostgREST / Supabase when `calendarific_holidays_cache` has not been migrated. */
export function isMissingCalendarificHolidaysCacheError(err: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    err.code === '42P01' ||
    m.includes('calendarific_holidays_cache') ||
    (m.includes('relation') && m.includes('does not exist')) ||
    m.includes('schema cache')
  );
}

export function calendarificMigrationHint(): {
  migrationFile: string;
  commands: string[];
} {
  return {
    migrationFile: CALENDARIFIC_CACHE_MIGRATION,
    commands: [
      'npm run supabase:db:push (when migration history matches remote)',
      'If db push fails: npm run supabase:db:apply:calendarific (runs this file against the linked project)',
      'Local: npx supabase start && npm run supabase:db:push:local',
    ],
  };
}

/** True when Postgres/PostgREST reports an unknown column (migration not applied yet). */
export function isMissingOrganisationsCelebrationColumnError(err: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    err.code === '42703' ||
    (m.includes('column') && m.includes('does not exist')) ||
    m.includes('celebration_holiday_country') ||
    m.includes('celebration_holidays_last_synced_at')
  );
}

export type OrgCelebrationFields = {
  celebration_holiday_country: string;
  celebration_holidays_last_synced_at: string | null;
};

/**
 * Reads celebration country + last sync from `organisations`, with fallback when
 * Calendarific migration columns are not deployed yet.
 */
export async function fetchOrgCelebrationFields(
  admin: SupabaseClient,
  orgId: string
): Promise<{ ok: true; fields: OrgCelebrationFields } | { ok: false; error: string }> {
  const extended = await admin
    .from('organisations')
    .select('celebration_holiday_country, celebration_holidays_last_synced_at')
    .eq('id', orgId)
    .maybeSingle();

  if (!extended.error && extended.data) {
    const row = extended.data as Record<string, unknown>;
    const raw = row.celebration_holiday_country;
    const country =
      typeof raw === 'string' && /^[A-Za-z]{2}$/.test(raw.trim()) ? raw.trim().toUpperCase() : 'GB';
    return {
      ok: true,
      fields: {
        celebration_holiday_country: country,
        celebration_holidays_last_synced_at:
          (row.celebration_holidays_last_synced_at as string | null) ?? null,
      },
    };
  }

  if (extended.error && isMissingOrganisationsCelebrationColumnError(extended.error)) {
    const base = await admin.from('organisations').select('id').eq('id', orgId).maybeSingle();
    if (base.error || !base.data) {
      return { ok: false, error: base.error?.message ?? 'Organisation not found' };
    }
    return {
      ok: true,
      fields: {
        celebration_holiday_country: 'GB',
        celebration_holidays_last_synced_at: null,
      },
    };
  }

  return {
    ok: false,
    error: extended.error?.message ?? 'Organisation not found',
  };
}
