import type { SupabaseClient } from '@supabase/supabase-js';

import { isMissingOrganisationsCelebrationColumnError } from '@/lib/calendarific/orgCelebrationDb';
import { fetchCalendarificHolidaysForYear } from '@/lib/calendarific/fetchHolidays';
import { monthDayWindowFromIso } from '@/lib/calendarific/holidayWindow';
import { mapHolidayNameToBuiltin } from '@/lib/calendarific/mapHolidayNameToBuiltin';
import type { CalendarificHoliday } from '@/lib/calendarific/types';
import {
  CELEBRATION_MODE_OPTIONS,
  type BuiltInCelebrationMode,
  getCelebrationModeAdminDefaults,
  normalizeCelebrationMode,
} from '@/lib/holidayThemes';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const BUILTIN_SYNCABLE: BuiltInCelebrationMode[] = CELEBRATION_MODE_OPTIONS.map((o) => o.id).filter(
  (id): id is BuiltInCelebrationMode => id !== 'off' && id !== 'pride'
);

function displayOrderForBuiltin(mode: BuiltInCelebrationMode): number {
  const idx = CELEBRATION_MODE_OPTIONS.findIndex((o) => o.id === mode);
  return idx >= 0 ? idx + 1 : 100;
}

function defaultLabelForBuiltin(mode: BuiltInCelebrationMode): string {
  return CELEBRATION_MODE_OPTIONS.find((o) => o.id === mode)?.label ?? mode;
}

export type SyncCelebrationHolidaysResult = {
  ok: true;
  country: string;
  years: number[];
  matchedModes: BuiltInCelebrationMode[];
  holidayCount: number;
  cacheHits: number;
  apiFetches: number;
};

export type SyncCelebrationHolidaysError = {
  ok: false;
  status: number;
  error: string;
};

async function loadOrRefreshYearCache(
  admin: SupabaseClient,
  apiKey: string,
  countryUpper: string,
  year: number,
  forceRefresh: boolean,
  signal: AbortSignal | undefined,
  stats: { cacheHits: number; apiFetches: number }
): Promise<{ ok: true; holidays: CalendarificHoliday[] } | SyncCelebrationHolidaysError> {
  const { data: row, error: selErr } = await admin
    .from('calendarific_holidays_cache')
    .select('holidays, fetched_at')
    .eq('country', countryUpper)
    .eq('year', year)
    .maybeSingle();

  if (selErr) {
    return { ok: false, status: 500, error: selErr.message };
  }

  const fresh =
    row?.fetched_at &&
    Date.now() - new Date(row.fetched_at as string).getTime() < CACHE_TTL_MS &&
    !forceRefresh;

  if (fresh && row?.holidays) {
    stats.cacheHits += 1;
    const holidays = row.holidays as CalendarificHoliday[];
    return { ok: true, holidays: Array.isArray(holidays) ? holidays : [] };
  }

  stats.apiFetches += 1;
  const fetched = await fetchCalendarificHolidaysForYear(apiKey, countryUpper, year, signal);
  if (!fetched.ok) {
    return {
      ok: false,
      status: fetched.status === 429 ? 429 : fetched.status >= 400 ? fetched.status : 502,
      error: fetched.message,
    };
  }

  const { error: upErr } = await admin.from('calendarific_holidays_cache').upsert(
    {
      country: countryUpper,
      year,
      holidays: fetched.holidays,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'country,year' }
  );

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  return { ok: true, holidays: fetched.holidays };
}

function firstIso(h: CalendarificHoliday): string | null {
  const iso = h.date?.iso?.trim();
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const dt = h.date?.datetime;
  if (dt && Number.isFinite(dt.year) && Number.isFinite(dt.month) && Number.isFinite(dt.day)) {
    const m = String(dt.month).padStart(2, '0');
    const d = String(dt.day).padStart(2, '0');
    return `${dt.year}-${m}-${d}`;
  }
  return null;
}

/**
 * Ensures shared Calendarific cache rows and upserts org_celebration_modes date windows
 * for built-in modes that map to public holidays (preserves is_enabled when a row already exists).
 */
export async function syncCelebrationHolidaysForOrg(args: {
  admin: SupabaseClient;
  orgId: string;
  country: string;
  apiKey: string;
  /** Current calendar year in the org's perspective — pass `new Date().getFullYear()`. */
  anchorYear: number;
  forceRefreshCache?: boolean;
  signal?: AbortSignal;
}): Promise<SyncCelebrationHolidaysResult | SyncCelebrationHolidaysError> {
  const countryUpper = args.country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryUpper)) {
    return { ok: false, status: 400, error: 'Invalid country code (use ISO 3166-1 alpha-2, e.g. GB).' };
  }

  const y0 = args.anchorYear;
  const y1 = y0 + 1;
  const years = [y0, y1];
  const stats = { cacheHits: 0, apiFetches: 0 };

  const merged: CalendarificHoliday[] = [];
  for (const year of years) {
    const block = await loadOrRefreshYearCache(
      args.admin,
      args.apiKey,
      countryUpper,
      year,
      Boolean(args.forceRefreshCache),
      args.signal,
      stats
    );
    if (!block.ok) return block;
    merged.push(...block.holidays);
  }

  const rankYear = (iso: string): number => {
    const y = Number(iso.slice(0, 4));
    if (y === y0) return 0;
    if (y === y1) return 1;
    return 2;
  };

  const bestByMode = new Map<BuiltInCelebrationMode, { iso: string; name: string }>();
  for (const h of merged) {
    const mode = mapHolidayNameToBuiltin(h.name);
    if (!mode) continue;
    const iso = firstIso(h);
    if (!iso) continue;
    const prev = bestByMode.get(mode);
    if (!prev) {
      bestByMode.set(mode, { iso, name: h.name });
      continue;
    }
    const rNew = rankYear(iso);
    const rOld = rankYear(prev.iso);
    if (rNew < rOld || (rNew === rOld && iso < prev.iso)) bestByMode.set(mode, { iso, name: h.name });
  }

  const { data: existingRows, error: exErr } = await args.admin
    .from('org_celebration_modes')
    .select(
      'mode_key,label,is_enabled,display_order,gradient_override,emoji_primary,emoji_secondary,auto_start_month,auto_start_day,auto_end_month,auto_end_day'
    )
    .eq('org_id', args.orgId);

  if (exErr) {
    return { ok: false, status: 500, error: exErr.message };
  }

  type OrgCelebrationRow = {
    mode_key: string;
    label: string;
    is_enabled: boolean;
    display_order: number;
    gradient_override: string | null;
    emoji_primary: string | null;
    emoji_secondary: string | null;
  };

  const existing = new Map(
    ((existingRows ?? []) as OrgCelebrationRow[]).map((r) => [r.mode_key, r])
  );

  const matchedModes: BuiltInCelebrationMode[] = [];

  for (const mode of BUILTIN_SYNCABLE) {
    const hit = bestByMode.get(mode);
    if (!hit) continue;

    const win = monthDayWindowFromIso(hit.iso, 1, 1);
    if (!win) continue;

    matchedModes.push(mode);
    const prev = existing.get(mode);
    const defaults = getCelebrationModeAdminDefaults(mode);
    const label =
      prev?.label?.trim() ||
      hit.name.trim() ||
      defaultLabelForBuiltin(mode);

    const payload = {
      org_id: args.orgId,
      mode_key: mode,
      label,
      is_enabled: prev ? Boolean(prev.is_enabled) : true,
      display_order:
        typeof prev?.display_order === 'number' ? prev.display_order : displayOrderForBuiltin(mode),
      auto_start_month: win.auto_start_month,
      auto_start_day: win.auto_start_day,
      auto_end_month: win.auto_end_month,
      auto_end_day: win.auto_end_day,
      gradient_override: prev?.gradient_override ?? defaults.gradient_override,
      emoji_primary: prev?.emoji_primary ?? defaults.emoji_primary,
      emoji_secondary: prev?.emoji_secondary ?? defaults.emoji_secondary,
    };

    const { error: upErr } = await args.admin.from('org_celebration_modes').upsert(payload, {
      onConflict: 'org_id,mode_key',
    });
    if (upErr) {
      return { ok: false, status: 500, error: upErr.message };
    }
  }

  const { error: orgErr } = await args.admin
    .from('organisations')
    .update({ celebration_holidays_last_synced_at: new Date().toISOString() })
    .eq('id', args.orgId);

  if (orgErr && !isMissingOrganisationsCelebrationColumnError(orgErr)) {
    return { ok: false, status: 500, error: orgErr.message };
  }

  return {
    ok: true,
    country: countryUpper,
    years,
    matchedModes,
    holidayCount: merged.length,
    cacheHits: stats.cacheHits,
    apiFetches: stats.apiFetches,
  };
}

export type PreviewHolidayRow = {
  name: string;
  iso: string | null;
  matchedBuiltin: BuiltInCelebrationMode | null;
};

export function buildPreviewRows(holidays: CalendarificHoliday[]): PreviewHolidayRow[] {
  const rows: PreviewHolidayRow[] = [];
  for (const h of holidays) {
    const iso = firstIso(h);
    const matched = mapHolidayNameToBuiltin(h.name);
    rows.push({ name: h.name, iso, matchedBuiltin: matched });
  }
  rows.sort((a, b) => (a.iso ?? '').localeCompare(b.iso ?? ''));
  return rows;
}

export function normalizeCelebrationCountry(raw: unknown): string {
  if (typeof raw !== 'string') return 'GB';
  const t = raw.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(t)) return t;
  return 'GB';
}
