'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { isMissingOrganisationsCelebrationColumnError } from '@/lib/calendarific/orgCelebrationDb';
import { monthDayWindowFromIso } from '@/lib/calendarific/holidayWindow';
import type { PreviewHolidayRow } from '@/lib/calendarific/syncCelebrationHolidays';
import {
  CELEBRATION_MODE_OPTIONS,
  getCelebrationModeAdminDefaults,
  getCelebrationModeDef,
  type BuiltInCelebrationMode,
} from '@/lib/holidayThemes';
import {
  enforceAccessibleBrandTokens,
  getBrandAccessibilityIssues,
  onColorFor,
  ORG_BRAND_POLICY_OPTIONS,
  ORG_BRAND_PRESETS,
  ORG_BRAND_TOKEN_KEYS,
  suggestedBrandTokensFromHexes,
  type OrgBrandTokenKey,
} from '@/lib/orgBranding';
import { FormSelect } from '@campsite/ui/web';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

type TabId = 'branding' | 'general' | 'celebrations' | 'danger';
type OrgCelebrationMode = {
  id: string;
  mode_key: string;
  label: string;
  is_enabled: boolean;
  display_order: number;
  auto_start_month: number | null;
  auto_start_day: number | null;
  auto_end_month: number | null;
  auto_end_day: number | null;
  gradient_override: string | null;
  emoji_primary: string | null;
  emoji_secondary: string | null;
};

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
] as const;

const DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => idx + 1);

const CELEBRATION_HOLIDAY_COUNTRY_OPTIONS = [
  { code: 'GB', label: 'United Kingdom (GB)' },
  { code: 'US', label: 'United States (US)' },
  { code: 'IE', label: 'Ireland (IE)' },
  { code: 'DE', label: 'Germany (DE)' },
  { code: 'FR', label: 'France (FR)' },
  { code: 'ES', label: 'Spain (ES)' },
  { code: 'IT', label: 'Italy (IT)' },
  { code: 'NL', label: 'Netherlands (NL)' },
  { code: 'BE', label: 'Belgium (BE)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'NZ', label: 'New Zealand (NZ)' },
  { code: 'IN', label: 'India (IN)' },
  { code: 'AE', label: 'United Arab Emirates (AE)' },
  { code: 'SG', label: 'Singapore (SG)' },
  { code: 'ZA', label: 'South Africa (ZA)' },
] as const;

type CalendarificHolidaysApiResponse = {
  country: string;
  years: number[];
  holidays: PreviewHolidayRow[];
  cacheRows: number;
  lastFetchedAt: string | null;
  orgLastSyncedAt: string | null;
  needsSync: boolean;
  migrationPending?: boolean;
  migrationFile?: string;
  commands?: string[];
};

const DEFAULT_CUSTOM_CELEBRATION_GRADIENT =
  'linear-gradient(180deg,#f97316 0%,#ec4899 50%,#8b5cf6 100%)';

const GRADIENT_DIRECTION_OPTIONS = [
  { angle: 180, label: 'Top to bottom' },
  { angle: 135, label: 'Diagonal' },
  { angle: 90, label: 'Left to right' },
  { angle: 45, label: 'Diagonal reverse' },
] as const;

const FALLBACK_GRADIENT_COLOR = '#f97316';

type CelebrationGradientBuilderValue = {
  angle: number;
  start: string;
  middle: string;
  end: string;
  hasMiddle: boolean;
  sourceStopCount: number;
};

function expandHexColor(input: string) {
  const trimmed = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (!/^#[0-9a-fA-F]{3}$/.test(trimmed)) return null;
  return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toLowerCase();
}

function clampGradientAngle(input: number) {
  if (!Number.isFinite(input)) return 180;
  const normalized = Math.round(input) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function gradientColorFromStop(stop: string) {
  const match = stop.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/);
  return match ? expandHexColor(match[0]) : null;
}

function parseCelebrationGradient(
  gradient: string | null | undefined
): CelebrationGradientBuilderValue | null {
  if (!gradient) return null;
  const match = gradient.trim().match(/^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\)$/i);
  if (!match) return null;
  const rawStops = match[2]
    .split(',')
    .map((stop) => stop.trim())
    .filter(Boolean);
  const colors = rawStops
    .map((stop) => gradientColorFromStop(stop))
    .filter((color): color is string => !!color);
  if (colors.length < 2) return null;
  const start = colors[0] ?? FALLBACK_GRADIENT_COLOR;
  const lastColor = colors[colors.length - 1] ?? FALLBACK_GRADIENT_COLOR;
  const end =
    lastColor === start && colors.length > 1 ? (colors[colors.length - 2] ?? lastColor) : lastColor;
  const middleIndex = colors.length >= 3 ? Math.floor(colors.length / 2) : 1;
  return {
    angle: clampGradientAngle(Number(match[1])),
    start,
    middle: colors[middleIndex] ?? end,
    end,
    hasMiddle: colors.length >= 3,
    sourceStopCount: colors.length,
  };
}

function buildCelebrationGradient(
  angle: number,
  colors: readonly [string, string] | readonly [string, string, string]
) {
  const stops =
    colors.length === 2
      ? [`${colors[0]} 0%`, `${colors[1]} 100%`]
      : [`${colors[0]} 0%`, `${colors[1]} 50%`, `${colors[2]} 100%`];
  return `linear-gradient(${clampGradientAngle(angle)}deg,${stops.join(',')})`;
}

function gradientStringFromBuilder(value: CelebrationGradientBuilderValue) {
  return buildCelebrationGradient(
    value.angle,
    value.hasMiddle
      ? ([value.start, value.middle, value.end] as const)
      : ([value.start, value.end] as const)
  );
}

function hasManualCelebrationWindow(
  mode: Pick<
    OrgCelebrationMode,
    'auto_start_month' | 'auto_start_day' | 'auto_end_month' | 'auto_end_day'
  >
) {
  return (
    mode.auto_start_month !== null &&
    mode.auto_start_day !== null &&
    mode.auto_end_month !== null &&
    mode.auto_end_day !== null
  );
}

function monthLabel(month: number | null) {
  return MONTH_OPTIONS.find((option) => option.value === month)?.label ?? null;
}

function formatCelebrationWindow(
  startMonth: number | null,
  startDay: number | null,
  endMonth: number | null,
  endDay: number | null
) {
  const startMonthLabel = monthLabel(startMonth);
  const endMonthLabel = monthLabel(endMonth);
  if (!startMonthLabel || !endMonthLabel || !startDay || !endDay) return null;
  return `${startMonthLabel} ${startDay} - ${endMonthLabel} ${endDay}`;
}

function orgInitials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image.'));
    };
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load selected image.'));
    img.src = src;
  });
}

async function cropSquareImageFile(
  file: File,
  xOffsetPct: number,
  yOffsetPct: number,
  zoom: number
): Promise<File> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);
  const minSide = Math.max(1, Math.min(img.width, img.height));
  const cropSize = Math.max(1, Math.min(minSide, Math.round(minSide / Math.max(1, zoom))));
  const centerX = img.width / 2 + (xOffsetPct / 100) * (img.width / 2);
  const centerY = img.height / 2 + (yOffsetPct / 100) * (img.height / 2);
  let sx = Math.round(centerX - cropSize / 2);
  let sy = Math.round(centerY - cropSize / 2);
  sx = Math.min(Math.max(0, sx), img.width - cropSize);
  sy = Math.min(Math.max(0, sy), img.height - cropSize);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('Could not crop image.');
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `logo-cropped.${ext}`, {
    type: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
  });
}

function Toggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'relative h-[21px] w-[38px] shrink-0 rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        on ? 'bg-[#121212]' : 'bg-[#d8d8d8]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] block h-[15px] w-[15px] rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-[17px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  );
}

function tabClass(active: boolean) {
  return [
    'w-full rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
    active
      ? 'border-[#121212] bg-[#121212] font-medium text-[#faf9f6]'
      : 'border-transparent text-[#6b6b6b] hover:bg-[#f5f4f1] hover:text-[#121212]',
  ].join(' ');
}

function GradientColorInput({
  label,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="block w-full min-w-0 rounded-xl border border-[#e4e0da] bg-white p-3">
      {hideLabel ? null : <span className="text-[12px] font-medium text-[#121212]">{label}</span>}
      <div className={[hideLabel ? 'mt-0' : 'mt-3', 'flex items-center gap-3'].join(' ')}>
        <span className="flex h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-[#d8d8d8] bg-white p-1">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="block h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0"
            aria-label={`${label} colour`}
          />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#121212]">
            {value}
          </div>
          <div className="mt-0.5 text-[11px] text-[#8a867f]">Pick a colour visually</div>
        </div>
      </div>
    </label>
  );
}

const tabs: { id: TabId; label: string }[] = [
  { id: 'branding', label: '🎨 Branding' },
  { id: 'general', label: '⚙️ General' },
  { id: 'celebrations', label: '🎉 Celebrations' },
  { id: 'danger', label: '⚠️ Danger zone' },
];

export function OrgSettingsClient({
  initial,
  initialCelebrationModes,
}: {
  initial: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    default_notifications_enabled: boolean;
    deactivation_requested_at: string | null;
    timezone: string | null;
    brand_preset_key: string | null;
    brand_tokens: Record<string, string> | null;
    brand_policy: string | null;
    celebration_holiday_country: string;
    celebration_holidays_last_synced_at: string | null;
  };
  initialCelebrationModes: OrgCelebrationMode[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<TabId>('branding');
  const [name, setName] = useState(initial.name);
  const [logoUrl, setLogoUrl] = useState(initial.logo_url ?? '');
  const [logoDomain, setLogoDomain] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropZoom, setCropZoom] = useState(1);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const cropDragStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(
    null
  );
  const [notif, setNotif] = useState(initial.default_notifications_enabled);
  const [timezone, setTimezone] = useState(initial.timezone ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [celebrationModes, setCelebrationModes] =
    useState<OrgCelebrationMode[]>(initialCelebrationModes);
  const [celebrationHolidayCountry, setCelebrationHolidayCountry] = useState(
    initial.celebration_holiday_country?.trim().toUpperCase() || 'GB'
  );
  const [calendarificPreview, setCalendarificPreview] = useState<CalendarificHolidaysApiResponse | null>(
    null
  );
  const [calendarificLoading, setCalendarificLoading] = useState(false);
  /** Background or manual refresh of official holiday dates (not shown as a vendor name). */
  const [publicHolidayDatesRefreshing, setPublicHolidayDatesRefreshing] = useState(false);
  const [holidaySearchQuery, setHolidaySearchQuery] = useState('');
  const [holidaySearchDebounced, setHolidaySearchDebounced] = useState('');
  const [holidayDateRefreshNote, setHolidayDateRefreshNote] = useState<string | null>(null);
  const [newModeKey, setNewModeKey] = useState('');
  const [newModeLabel, setNewModeLabel] = useState('');
  const [selectedCelebrationModeKey, setSelectedCelebrationModeKey] = useState<string>(
    () => CELEBRATION_MODE_OPTIONS.find((mode) => mode.id !== 'off')?.id ?? ''
  );
  const [brandPresetKey, setBrandPresetKey] = useState(initial.brand_preset_key ?? 'campfire');
  const [brandPolicy, setBrandPolicy] = useState(
    initial.brand_policy ?? 'brand_base_with_celebration_accents'
  );
  const [brandTokens, setBrandTokens] = useState<Record<OrgBrandTokenKey, string>>(() => {
    const incoming = (initial.brand_tokens ?? {}) as Record<string, string>;
    const base = ORG_BRAND_PRESETS.campfire;
    const next: Record<OrgBrandTokenKey, string> = { ...base };
    for (const key of ORG_BRAND_TOKEN_KEYS) {
      const value = incoming[key];
      if (typeof value === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(value.trim()))
        next[key] = value.trim();
    }
    return next;
  });

  const initials = useMemo(() => orgInitials(name), [name]);
  const trimmedLogoUrl = logoUrl.trim();
  const brandAccessibilityIssues = useMemo(
    () => getBrandAccessibilityIssues(brandTokens),
    [brandTokens]
  );

  useEffect(() => {
    setLogoPreviewFailed(false);
  }, [trimmedLogoUrl]);

  useEffect(() => {
    if (!pendingLogoFile) {
      setPendingLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingLogoFile);
    setPendingLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingLogoFile]);

  useEffect(() => {
    setName(initial.name);
    setLogoUrl(initial.logo_url ?? '');
    setNotif(initial.default_notifications_enabled);
    setTimezone(initial.timezone ?? '');
    setBrandPresetKey(initial.brand_preset_key ?? 'campfire');
    setBrandPolicy(initial.brand_policy ?? 'brand_base_with_celebration_accents');
    const incoming = (initial.brand_tokens ?? {}) as Record<string, string>;
    setBrandTokens(() => {
      const base = ORG_BRAND_PRESETS.campfire;
      const next: Record<OrgBrandTokenKey, string> = { ...base };
      for (const key of ORG_BRAND_TOKEN_KEYS) {
        const value = incoming[key];
        if (typeof value === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(value.trim()))
          next[key] = value.trim();
      }
      return next;
    });
  }, [initial]);
  useEffect(() => {
    setCelebrationModes(initialCelebrationModes);
  }, [initialCelebrationModes]);

  useEffect(() => {
    setCelebrationHolidayCountry(initial.celebration_holiday_country?.trim().toUpperCase() || 'GB');
  }, [initial.celebration_holiday_country]);

  useEffect(() => {
    const t = window.setTimeout(() => setHolidaySearchDebounced(holidaySearchQuery.trim()), 280);
    return () => window.clearTimeout(t);
  }, [holidaySearchQuery]);

  async function refreshPublicHolidayPreview() {
    setCalendarificLoading(true);
    try {
      const res = await fetch('/api/org/celebrations/calendarific-holidays');
      const body = (await res.json().catch(() => null)) as CalendarificHolidaysApiResponse | null;
      if (res.ok && body && Array.isArray(body.holidays)) {
        setCalendarificPreview(body);
      }
    } finally {
      setCalendarificLoading(false);
    }
  }

  /** Pulls official holiday calendars and updates built-in celebration date windows (server-side). */
  async function syncOfficialHolidayDates(opts: {
    forceRefreshCache: boolean;
    silent: boolean;
  }): Promise<boolean> {
    if (!opts.silent) setMsg(null);
    setPublicHolidayDatesRefreshing(true);
    try {
      const res = await fetch('/api/org/celebrations/calendarific-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefreshCache: opts.forceRefreshCache }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        matchedModes?: string[];
        migrationFile?: string;
        commands?: string[];
      };
      if (!res.ok) {
        const isMigration =
          res.status === 503 &&
          typeof body.error === 'string' &&
          body.error.toLowerCase().includes('migration');
        if (!opts.silent) {
          flash(
            isMigration
              ? `${body.error} See the notice on this page for next steps.`
              : `${body.error || 'Could not refresh official holiday dates.'}${
                  Array.isArray(body.commands) && body.commands.length > 0 ? ` ${body.commands[0]}` : ''
                }`,
            'err'
          );
        } else if (
          res.status === 503 &&
          /CALENDARIFIC_API_KEY|not configured/i.test(String(body.error ?? ''))
        ) {
          setHolidayDateRefreshNote(
            'Automatic holiday date updates are not available on this server yet.'
          );
        }
        return false;
      }
      if (!opts.silent) {
        const n = body.matchedModes?.length ?? 0;
        flash(
          n > 0
            ? `Updated date windows for ${n} built-in celebration${n === 1 ? '' : 's'}. Save celebrations if you changed anything else.`
            : 'Official holiday dates refreshed. Save celebrations if you changed anything else.',
          'ok'
        );
        await router.refresh();
      }
      await refreshPublicHolidayPreview();
      return true;
    } catch {
      if (!opts.silent) flash('Network error while refreshing holiday dates.', 'err');
      return false;
    } finally {
      setPublicHolidayDatesRefreshing(false);
    }
  }

  useEffect(() => {
    if (tab !== 'celebrations') return;
    let cancelled = false;
    void (async () => {
      setCalendarificLoading(true);
      setHolidayDateRefreshNote(null);
      try {
        const res = await fetch('/api/org/celebrations/calendarific-holidays');
        const body = (await res.json().catch(() => null)) as CalendarificHolidaysApiResponse | null;
        if (cancelled) return;
        if (res.ok && body && Array.isArray(body.holidays)) {
          setCalendarificPreview(body);
        }
        if (body?.migrationPending) return;

        const throttleKey = `campsite_public_holiday_autosync:${initial.id}:${initial.celebration_holiday_country ?? 'GB'}`;
        const last = sessionStorage.getItem(throttleKey);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        const shouldRun = !last || now - Number(last) > twelveHours;
        if (!shouldRun) return;

        const ok = await syncOfficialHolidayDates({ forceRefreshCache: false, silent: true });
        if (!cancelled && ok) sessionStorage.setItem(throttleKey, String(now));
      } finally {
        if (!cancelled) setCalendarificLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncOfficialHolidayDates is stable enough; avoid re-running auto-sync every render
  }, [tab, initial.id, initial.celebration_holiday_country]);

  function slugifyCalendarificCustomKey(name: string): string {
    const raw = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const base = raw.length > 0 ? raw.slice(0, 48) : 'holiday';
    return `cal_${base}`;
  }

  function customModeKeyFromHolidayName(name: string): string {
    return `org_custom:${slugifyCalendarificCustomKey(name)}`;
  }

  function addPublicHolidayAsCustom(row: PreviewHolidayRow) {
    if (row.matchedBuiltin || !row.iso) {
      flash('Only unmapped holidays with a date can be added as custom.', 'err');
      return;
    }
    const modeKey = customModeKeyFromHolidayName(row.name);
    if (celebrationModes.some((m) => m.mode_key === modeKey)) {
      flash('That holiday is already on the list.', 'err');
      return;
    }
    const win = monthDayWindowFromIso(row.iso, 1, 1);
    if (!win) {
      flash('Could not read that holiday date.', 'err');
      return;
    }
    setCelebrationModes((prev) => [
      ...prev,
      {
        id: `draft-${modeKey}`,
        mode_key: modeKey,
        label: row.name.trim() || 'Custom celebration',
        is_enabled: true,
        display_order: 850,
        auto_start_month: win.auto_start_month,
        auto_start_day: win.auto_start_day,
        auto_end_month: win.auto_end_month,
        auto_end_day: win.auto_end_day,
        gradient_override: DEFAULT_CUSTOM_CELEBRATION_GRADIENT,
        emoji_primary: '✨',
        emoji_secondary: '🎉',
      },
    ]);
    setSelectedCelebrationModeKey(modeKey);
    flash('Added as a custom celebration. Click Save celebrations to persist.', 'ok');
  }

  function enableBuiltinFromHolidaySearch(builtin: BuiltInCelebrationMode) {
    const label = CELEBRATION_MODE_OPTIONS.find((o) => o.id === builtin)?.label ?? builtin;
    const order = CELEBRATION_MODE_OPTIONS.findIndex((o) => o.id === builtin) + 1;
    const row = getCelebrationEditorRow(builtin, label, order);
    if (row.is_enabled) {
      flash(`${label} is already on. Click Save celebrations if you have other changes.`, 'ok');
      return;
    }
    setModeField(builtin, 'is_enabled', true, label, order);
    setHolidaySearchQuery('');
    flash(`Turned on ${label}. Click Save celebrations to keep this change.`, 'ok');
  }

  const publicHolidaySearchResults = useMemo(() => {
    const rows = calendarificPreview?.holidays ?? [];
    const q = holidaySearchDebounced.toLowerCase();
    if (!q) return [];
    const scored: { h: PreviewHolidayRow; score: number }[] = [];
    for (const h of rows) {
      const name = (h.name ?? '').toLowerCase();
      const iso = (h.iso ?? '').toLowerCase();
      let score: number | null = null;
      if (name === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (iso.includes(q)) score = 3;
      if (score !== null) scored.push({ h, score });
    }
    scored.sort((a, b) => a.score - b.score || a.h.name.localeCompare(b.h.name));
    return scored.slice(0, 16).map((x) => x.h);
  }, [calendarificPreview?.holidays, holidaySearchDebounced]);
  const customCelebrationModes = useMemo(
    () => celebrationModes.filter((mode) => mode.mode_key.startsWith('org_custom:')),
    [celebrationModes]
  );

  const builtInModes = useMemo(() => CELEBRATION_MODE_OPTIONS.filter((m) => m.id !== 'off'), []);
  const celebrationModeEntries = useMemo(
    () => [
      ...builtInModes,
      ...celebrationModes
        .filter((mode) => mode.mode_key.startsWith('org_custom:'))
        .map((mode) => ({
          id: mode.mode_key,
          label: mode.label,
          category: 'Organisation custom' as const,
        })),
    ],
    [builtInModes, celebrationModes]
  );

  function getCelebrationEditorRow(modeKey: string, fallbackLabel: string, fallbackOrder: number) {
    const existing = celebrationModes.find((mode) => mode.mode_key === modeKey);
    if (existing) return existing;
    return {
      id: `base-${modeKey}`,
      mode_key: modeKey,
      label: fallbackLabel,
      is_enabled: true,
      display_order: fallbackOrder,
      ...getCelebrationModeAdminDefaults(
        modeKey as Parameters<typeof getCelebrationModeAdminDefaults>[0]
      ),
    };
  }

  const selectedCelebrationIndex = useMemo(
    () => celebrationModeEntries.findIndex((mode) => mode.id === selectedCelebrationModeKey),
    [celebrationModeEntries, selectedCelebrationModeKey]
  );
  const selectedCelebrationMeta =
    selectedCelebrationIndex >= 0 ? celebrationModeEntries[selectedCelebrationIndex] : null;
  const selectedCelebrationRow = selectedCelebrationMeta
    ? getCelebrationEditorRow(
        selectedCelebrationMeta.id,
        selectedCelebrationMeta.label,
        selectedCelebrationIndex + 1
      )
    : null;
  const selectedCelebrationDef = selectedCelebrationMeta
    ? getCelebrationModeDef(
        selectedCelebrationMeta.id as Parameters<typeof getCelebrationModeAdminDefaults>[0],
        celebrationModes
      )
    : null;
  const celebrationModeGroups = useMemo(() => {
    const grouped = new Map<string, typeof celebrationModeEntries>();
    for (const mode of celebrationModeEntries) {
      const list = grouped.get(mode.category) ?? [];
      list.push(mode);
      grouped.set(mode.category, list);
    }
    return Array.from(grouped.entries());
  }, [celebrationModeEntries]);

  useEffect(() => {
    if (!celebrationModeEntries.some((mode) => mode.id === selectedCelebrationModeKey)) {
      setSelectedCelebrationModeKey(celebrationModeEntries[0]?.id ?? '');
    }
  }, [celebrationModeEntries, selectedCelebrationModeKey]);

  function getCelebrationTimingSummary(row: OrgCelebrationMode) {
    if (hasManualCelebrationWindow(row)) {
      return (
        formatCelebrationWindow(
          row.auto_start_month,
          row.auto_start_day,
          row.auto_end_month,
          row.auto_end_day
        ) ?? 'Custom dates'
      );
    }
    if (row.mode_key.startsWith('org_custom:')) return 'Dates not set yet';
    const defaults = getCelebrationModeAdminDefaults(
      row.mode_key as Parameters<typeof getCelebrationModeAdminDefaults>[0]
    );
    const defaultWindow = formatCelebrationWindow(
      defaults.auto_start_month,
      defaults.auto_start_day,
      defaults.auto_end_month,
      defaults.auto_end_day
    );
    return defaultWindow ?? 'Follows the holiday automatically each year';
  }

  function flash(message: string, tone: 'ok' | 'err') {
    setMsg(message);
    setMsgTone(tone);
  }

  async function invalidateOrgSettingsCaches() {
    await invalidateClientCaches({ scopes: ['org-settings'] }).catch(() => null);
  }

  async function persistBrandingPatch(patch: Record<string, unknown>) {
    const { error } = await supabase.from('organisations').update(patch).eq('id', initial.id);
    if (error) throw new Error(error.message);
    await invalidateOrgSettingsCaches();
  }

  function toLogoDevDomain(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const host = new URL(withProto).hostname.toLowerCase().replace(/^www\./, '');
      if (!host.includes('.')) return null;
      return host;
    } catch {
      return null;
    }
  }

  async function lookupLogoFromDomain() {
    const domain = toLogoDevDomain(logoDomain);
    if (!domain) {
      flash('Enter a valid company domain, e.g. acme.com.', 'err');
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/org-logo/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        flash(body.error || 'Could not find a logo for that domain.', 'err');
        return;
      }
      const nextLogoUrl = body.url;
      setLogoUrl(nextLogoUrl);
      let nextTokens = brandTokens;
      const suggested = await suggestColorsFromLogo(nextLogoUrl, { quiet: true });
      if (suggested) {
        nextTokens = { ...brandTokens, ...suggested };
        const enforced = enforceAccessibleBrandTokens(nextTokens);
        nextTokens = enforced.tokens;
        setBrandTokens(nextTokens);
      }
      await persistBrandingPatch({
        logo_url: nextLogoUrl,
        brand_tokens: nextTokens,
        brand_updated_at: new Date().toISOString(),
      });
      flash('Logo found and saved.', 'ok');
      router.refresh();
    } catch {
      flash('Network error while finding logo.', 'err');
    } finally {
      setLoading(false);
    }
  }

  async function uploadCustomLogo(file: File) {
    setUploadingLogo(true);
    setLoading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/org-logo/upload', {
        method: 'POST',
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        flash(body.error || 'Could not upload logo image.', 'err');
        return;
      }
      const nextLogoUrl = body.url;
      setLogoUrl(nextLogoUrl);
      let nextTokens = brandTokens;
      const suggested = await suggestColorsFromLogo(nextLogoUrl, { quiet: true });
      if (suggested) {
        nextTokens = { ...brandTokens, ...suggested };
        const enforced = enforceAccessibleBrandTokens(nextTokens);
        nextTokens = enforced.tokens;
        setBrandTokens(nextTokens);
      }
      await persistBrandingPatch({
        logo_url: nextLogoUrl,
        brand_tokens: nextTokens,
        brand_updated_at: new Date().toISOString(),
      });
      flash('Custom logo uploaded and saved.', 'ok');
      router.refresh();
    } catch {
      flash('Network error while uploading logo.', 'err');
    } finally {
      setUploadingLogo(false);
      setLoading(false);
      if (logoFileInputRef.current) logoFileInputRef.current.value = '';
    }
  }

  async function applyCroppedUpload() {
    if (!pendingLogoFile) return;
    try {
      const cropped = await cropSquareImageFile(pendingLogoFile, cropX, cropY, cropZoom);
      setCropModalOpen(false);
      setPendingLogoFile(null);
      setCropX(0);
      setCropY(0);
      setCropZoom(1);
      await uploadCustomLogo(cropped);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not crop image.', 'err');
    }
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    cropDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      cropX,
      cropY,
    };
    setIsDraggingCrop(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleCropPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingCrop || !cropDragStartRef.current) return;
    const dx = e.clientX - cropDragStartRef.current.x;
    const dy = e.clientY - cropDragStartRef.current.y;
    // About 2px per 1% move keeps drag comfortable.
    const nextX = Math.max(-50, Math.min(50, cropDragStartRef.current.cropX + dx / 2));
    const nextY = Math.max(-50, Math.min(50, cropDragStartRef.current.cropY + dy / 2));
    setCropX(nextX);
    setCropY(nextY);
  }

  function handleCropPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    setIsDraggingCrop(false);
    cropDragStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  async function saveBranding() {
    setLoading(true);
    setMsg(null);
    if (trimmedLogoUrl && logoPreviewFailed) {
      setLoading(false);
      flash(
        'Logo URL must be a direct link to an image file (e.g. ending in .png or .svg), not a normal web page.',
        'err'
      );
      return;
    }
    const enforced = enforceAccessibleBrandTokens(brandTokens);
    if (enforced.adjusted) {
      setBrandTokens(enforced.tokens);
    }
    const { error } = await supabase
      .from('organisations')
      .update({
        name: name.trim(),
        logo_url: trimmedLogoUrl || null,
        brand_preset_key: brandPresetKey,
        brand_policy: brandPolicy,
        brand_tokens: enforced.tokens,
        brand_updated_at: new Date().toISOString(),
      })
      .eq('id', initial.id);
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    await invalidateOrgSettingsCaches();
    flash(
      enforced.adjusted
        ? 'Branding saved. Some colors were adjusted for accessibility.'
        : 'Branding saved.',
      'ok'
    );
    router.refresh();
  }

  async function suggestColorsFromLogo(
    sourceLogoUrl = trimmedLogoUrl,
    opts?: { quiet?: boolean }
  ): Promise<Partial<Record<OrgBrandTokenKey, string>> | null> {
    const logoUrlForSuggestion = sourceLogoUrl.trim();
    if (!logoUrlForSuggestion) {
      if (!opts?.quiet) flash('Set or upload a logo first.', 'err');
      return null;
    }
    if (!opts?.quiet) {
      setLoading(true);
      setMsg(null);
    }
    try {
      const res = await fetch('/api/org-logo/suggest-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: logoUrlForSuggestion, orgName: name.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        colors?: string[];
        error?: string;
      };
      if (!res.ok || !body.colors || body.colors.length === 0) {
        if (!opts?.quiet) flash(body.error || 'Could not suggest colors from that logo.', 'err');
        return null;
      }
      const suggested = suggestedBrandTokensFromHexes(body.colors);
      if (!opts?.quiet) {
        setBrandTokens((prev) => ({ ...prev, ...suggested }));
        flash('Suggested colors applied. Review and save branding.', 'ok');
      }
      return suggested;
    } catch {
      if (!opts?.quiet) flash('Network error while suggesting colors.', 'err');
      return null;
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }

  async function removeLogoNow() {
    setLoading(true);
    setMsg(null);
    setLogoUrl('');
    try {
      await persistBrandingPatch({
        logo_url: null,
        brand_updated_at: new Date().toISOString(),
      });
      flash('Logo removed.', 'ok');
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not remove logo.', 'err');
    } finally {
      setLoading(false);
    }
  }

  async function resetBrandingToDefault() {
    setLoading(true);
    setMsg(null);
    const defaultPresetKey = 'campfire';
    const defaultPolicy = 'brand_base_with_celebration_accents';
    const defaultTokens = { ...ORG_BRAND_PRESETS.campfire };
    setBrandPresetKey(defaultPresetKey);
    setBrandPolicy(defaultPolicy);
    setBrandTokens(defaultTokens);
    try {
      await persistBrandingPatch({
        brand_preset_key: defaultPresetKey,
        brand_policy: defaultPolicy,
        brand_tokens: defaultTokens,
        brand_updated_at: new Date().toISOString(),
      });
      flash('Branding reset to Campsite defaults.', 'ok');
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Could not reset branding.', 'err');
    } finally {
      setLoading(false);
    }
  }

  async function saveGeneral() {
    setLoading(true);
    setMsg(null);
    const tz = timezone.trim();
    const { error } = await supabase
      .from('organisations')
      .update({
        default_notifications_enabled: notif,
        timezone: tz.length > 0 ? tz : null,
      })
      .eq('id', initial.id);
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    await invalidateOrgSettingsCaches();
    flash('Settings saved.', 'ok');
    router.refresh();
  }

  async function requestDeactivation() {
    if (
      !confirm(
        'Request organisation deactivation? Activity will wind down and Common Ground Studios will follow up off-platform.'
      )
    )
      return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase
      .from('organisations')
      .update({ deactivation_requested_at: new Date().toISOString() })
      .eq('id', initial.id);
    setLoading(false);
    if (error) flash(error.message, 'err');
    else {
      await invalidateOrgSettingsCaches();
      flash('Deactivation request recorded.', 'ok');
      router.refresh();
    }
  }

  function setModeField<K extends keyof OrgCelebrationMode>(
    modeKey: string,
    key: K,
    value: OrgCelebrationMode[K],
    fallbackLabel?: string,
    fallbackOrder = 100
  ) {
    setCelebrationModes((prev) => {
      const idx = prev.findIndex((row) => row.mode_key === modeKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], [key]: value };
        return next;
      }
      return [
        ...prev,
        {
          id: `draft-${modeKey}`,
          mode_key: modeKey,
          label: fallbackLabel ?? modeKey,
          is_enabled: true,
          display_order: fallbackOrder,
          ...getCelebrationModeAdminDefaults(
            modeKey as Parameters<typeof getCelebrationModeAdminDefaults>[0]
          ),
          [key]: value,
        },
      ];
    });
  }

  async function saveCelebrations() {
    setLoading(true);
    setMsg(null);
    const countryNorm = celebrationHolidayCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryNorm)) {
      setLoading(false);
      flash('Public holiday country must be a 2-letter ISO code (e.g. GB).', 'err');
      return;
    }
    const { error: orgCountryErr } = await supabase
      .from('organisations')
      .update({ celebration_holiday_country: countryNorm })
      .eq('id', initial.id);
    if (orgCountryErr && !isMissingOrganisationsCelebrationColumnError(orgCountryErr)) {
      setLoading(false);
      flash(orgCountryErr.message, 'err');
      return;
    }
    const payload = celebrationModes.map((row) => ({
      org_id: initial.id,
      mode_key: row.mode_key,
      label: row.label.trim() || row.mode_key,
      is_enabled: row.is_enabled,
      display_order: row.display_order,
      auto_start_month: row.auto_start_month,
      auto_start_day: row.auto_start_day,
      auto_end_month: row.auto_end_month,
      auto_end_day: row.auto_end_day,
      gradient_override: row.gradient_override?.trim() || null,
      emoji_primary: row.emoji_primary?.trim() || null,
      emoji_secondary: row.emoji_secondary?.trim() || null,
    }));
    const { error } = await supabase
      .from('org_celebration_modes')
      .upsert(payload, { onConflict: 'org_id,mode_key' });
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    await invalidateOrgSettingsCaches();
    flash('Celebration settings saved.', 'ok');
    router.refresh();
  }

  async function removeMode(modeKey: string) {
    if (!modeKey.startsWith('org_custom:')) return;
    setLoading(true);
    setMsg(null);
    const { error } = await supabase
      .from('org_celebration_modes')
      .delete()
      .eq('org_id', initial.id)
      .eq('mode_key', modeKey);
    setLoading(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    setCelebrationModes((prev) => prev.filter((row) => row.mode_key !== modeKey));
    await invalidateOrgSettingsCaches();
    flash('Custom mode removed.', 'ok');
    router.refresh();
  }

  function addCustomModeDraft() {
    const keyPart = newModeKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!keyPart) {
      flash('Custom mode key is required.', 'err');
      return;
    }
    const modeKey = `org_custom:${keyPart}`;
    if (celebrationModes.some((m) => m.mode_key === modeKey)) {
      flash('A mode with that key already exists.', 'err');
      return;
    }
    setCelebrationModes((prev) => [
      ...prev,
      {
        id: `draft-${modeKey}`,
        mode_key: modeKey,
        label: newModeLabel.trim() || 'Custom mode',
        is_enabled: true,
        display_order: 900,
        auto_start_month: null,
        auto_start_day: null,
        auto_end_month: null,
        auto_end_day: null,
        gradient_override: DEFAULT_CUSTOM_CELEBRATION_GRADIENT,
        emoji_primary: '✨',
        emoji_secondary: '🎉',
      },
    ]);
    setNewModeKey('');
    setNewModeLabel('');
    setSelectedCelebrationModeKey(modeKey);
    setTab('celebrations');
  }

  async function exportMemberCsv() {
    setExporting(true);
    setMsg(null);
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status, created_at')
      .eq('org_id', initial.id)
      .order('created_at', { ascending: false })
      .limit(5000);
    setExporting(false);
    if (error) {
      flash(error.message, 'err');
      return;
    }
    const list = rows ?? [];
    const lines = [
      ['id', 'full_name', 'email', 'role', 'status', 'created_at'].join(','),
      ...list.map((r) =>
        [
          r.id,
          JSON.stringify((r.full_name as string) ?? ''),
          JSON.stringify((r.email as string | null) ?? ''),
          r.role,
          r.status,
          r.created_at,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `members-${initial.slug}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Export downloaded.', 'ok');
  }

  const selectedCelebrationUsesCustomWindow = selectedCelebrationRow
    ? selectedCelebrationRow.mode_key.startsWith('org_custom:') ||
      hasManualCelebrationWindow(selectedCelebrationRow)
    : false;
  const selectedCelebrationTheme = selectedCelebrationRow?.gradient_override?.trim() || null;
  const selectedCelebrationGradientBuilder = useMemo(() => {
    const gradientSource =
      selectedCelebrationTheme ??
      selectedCelebrationDef?.gradient ??
      DEFAULT_CUSTOM_CELEBRATION_GRADIENT;
    return (
      parseCelebrationGradient(gradientSource) ??
      parseCelebrationGradient(DEFAULT_CUSTOM_CELEBRATION_GRADIENT) ?? {
        angle: 180,
        start: '#f97316',
        middle: '#ec4899',
        end: '#8b5cf6',
        hasMiddle: true,
        sourceStopCount: 3,
      }
    );
  }, [selectedCelebrationDef?.gradient, selectedCelebrationTheme]);
  const selectedCelebrationGradientPreview =
    selectedCelebrationDef?.gradient ??
    gradientStringFromBuilder(selectedCelebrationGradientBuilder);

  function updateCelebrationGradient(
    patch: Partial<
      Pick<CelebrationGradientBuilderValue, 'angle' | 'start' | 'middle' | 'end' | 'hasMiddle'>
    >
  ) {
    if (!selectedCelebrationRow) return;
    const next = {
      ...selectedCelebrationGradientBuilder,
      ...patch,
    };
    setModeField(
      selectedCelebrationRow.mode_key,
      'gradient_override',
      gradientStringFromBuilder(next),
      selectedCelebrationRow.label,
      selectedCelebrationIndex + 1
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-7 xl:px-9">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Organisation settings
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Configure your organisation&apos;s branding and general settings.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-0.5 xl:sticky xl:top-24" aria-label="Settings sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setMsg(null);
              }}
              className={tabClass(tab === t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === 'branding' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">Branding</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                Customise how your organisation appears in Campsite.
              </p>

              <div className="mt-5 flex flex-col gap-4 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 sm:flex-row sm:items-center">
                <div className="mx-auto h-16 w-16 shrink-0 sm:mx-0">
                  {trimmedLogoUrl && !logoPreviewFailed ? (
                    <img
                      key={trimmedLogoUrl}
                      src={trimmedLogoUrl}
                      alt=""
                      onError={() => setLogoPreviewFailed(true)}
                      className="h-16 w-16 rounded-xl border border-[#d8d8d8] bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#121212] font-authSerif text-[22px] text-[#faf9f6]">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="text-[13.5px] font-medium text-[#121212]">Organisation logo</div>
                  <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                    Use a <strong className="font-medium text-[#6b6b6b]">direct image URL</strong>{' '}
                    (PNG, SVG, JPG, or WebP) - not a website homepage. The link should usually end
                    in <span className="font-mono">.png</span>,{' '}
                    <span className="font-mono">.svg</span>, etc.
                  </p>
                  {trimmedLogoUrl && logoPreviewFailed ? (
                    <p className="mt-2 text-[11.5px] font-medium text-[#b45309]">
                      We couldn&apos;t load an image from this URL. Try opening it in a new tab - if
                      you see a page instead of a picture, paste the image file&apos;s address
                      instead.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <button
                      type="button"
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
                      onClick={() => {
                        const url = window.prompt('Logo image URL (https://...)');
                        if (url === null) return;
                        setLogoUrl(url.trim());
                      }}
                    >
                      Set from URL
                    </button>
                    <button
                      type="button"
                      disabled={!trimmedLogoUrl || loading}
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-40"
                      onClick={() => void removeLogoNow()}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">
                  Organisation name
                </span>
                <input
                  className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">
                  Subdomain
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2.5 font-mono text-[13px] text-[#121212]"
                    value={initial.slug}
                  />
                  <span className="shrink-0 text-[13px] text-[#9b9b9b]">.camp-site.co.uk</span>
                </div>
                <span className="mt-1 block text-[11.5px] text-[#9b9b9b]">
                  Slug is set when the organisation is created; contact support to change invite
                  links.
                </span>
              </label>

              <div className="mt-4 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
                <div className="text-[12.5px] font-medium text-[#121212]">
                  Find from website domain
                </div>
                <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                  Enter the organisation website domain and we&apos;ll try to fetch the latest logo.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                    value={logoDomain}
                    onChange={(e) => setLogoDomain(e.target.value)}
                    placeholder="acme.com"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => void lookupLogoFromDomain()}
                    disabled={loading}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                  >
                    Find logo
                  </button>
                </div>
                <p className="mt-2 text-[11.5px] text-[#9b9b9b]">
                  If the result is outdated, upload your own image below.
                </p>
              </div>

              <div className="mt-3 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
                <div className="text-[12.5px] font-medium text-[#121212]">Upload custom logo</div>
                <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                  PNG, JPG, WebP, GIF, or SVG up to 5 MB.
                </p>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  className="sr-only"
                  id="org-logo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setPendingLogoFile(file);
                    setCropX(0);
                    setCropY(0);
                    setCropZoom(1);
                    setCropModalOpen(true);
                  }}
                />
                <div className="mt-2">
                  <label
                    htmlFor="org-logo-upload"
                    className="inline-flex cursor-pointer rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                  >
                    {uploadingLogo ? 'Uploading…' : 'Choose image'}
                  </label>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
                <div className="text-[12.5px] font-medium text-[#121212]">Brand palette</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-[11.5px] text-[#6b6b6b]">
                    Preset
                    <FormSelect
                      wrapperClassName="mt-1"
                      controlSize="sm"
                      value={brandPresetKey}
                      onChange={(e) => {
                        const k = e.target.value as keyof typeof ORG_BRAND_PRESETS;
                        setBrandPresetKey(k);
                        const preset = ORG_BRAND_PRESETS[k] ?? ORG_BRAND_PRESETS.campfire;
                        setBrandTokens({ ...preset });
                      }}
                    >
                      {Object.keys(ORG_BRAND_PRESETS).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="text-[11.5px] text-[#6b6b6b]">
                    Celebration + brand policy
                    <FormSelect
                      wrapperClassName="mt-1"
                      controlSize="sm"
                      value={brandPolicy}
                      onChange={(e) => setBrandPolicy(e.target.value)}
                    >
                      {ORG_BRAND_POLICY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ORG_BRAND_TOKEN_KEYS.map((key) => (
                    <label key={key} className="text-[11.5px] text-[#6b6b6b]">
                      {key}
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={brandTokens[key]}
                          onChange={(e) =>
                            setBrandTokens((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className="h-9 w-10 rounded border border-[#d8d8d8] bg-white"
                        />
                        <input
                          value={brandTokens[key]}
                          onChange={(e) =>
                            setBrandTokens((prev) => ({ ...prev, [key]: e.target.value.trim() }))
                          }
                          className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-2 text-[12px] text-[#121212]"
                          placeholder="#000000"
                        />
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void suggestColorsFromLogo(trimmedLogoUrl)}
                    disabled={loading}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                  >
                    Suggest colors from logo
                  </button>
                  <button
                    type="button"
                    onClick={() => void resetBrandingToDefault()}
                    disabled={loading}
                    className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
                  >
                    Reset to default
                  </button>
                </div>
                <div className="mt-3 rounded-lg border border-[#d8d8d8] bg-white p-3">
                  <div className="text-[11.5px] font-medium text-[#6b6b6b]">Preview</div>
                  <div
                    className="mt-2 rounded-md px-3 py-2 text-[12px]"
                    style={{
                      background: brandTokens.bg,
                      color: brandTokens.text,
                      border: `1px solid ${brandTokens.border}`,
                    }}
                  >
                    <div
                      className="rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{ background: brandTokens.surface, color: brandTokens.muted }}
                    >
                      Surface sample
                    </div>
                    <div className="mt-2 flex gap-2">
                      <span
                        className="rounded px-2 py-1"
                        style={{
                          background: brandTokens.primary,
                          color: onColorFor(brandTokens.primary),
                        }}
                      >
                        Primary
                      </span>
                      <span
                        className="rounded px-2 py-1"
                        style={{
                          background: brandTokens.secondary,
                          color: onColorFor(brandTokens.secondary),
                        }}
                      >
                        Secondary
                      </span>
                      <span
                        className="rounded px-2 py-1"
                        style={{
                          background: brandTokens.accent,
                          color: onColorFor(brandTokens.accent),
                        }}
                      >
                        Accent
                      </span>
                    </div>
                  </div>
                </div>
                {brandAccessibilityIssues.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-[#fecaca] bg-[#fff5f5] p-3">
                    <div className="text-[12px] font-semibold text-[#b91c1c]">
                      Accessibility warning
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#b45309]">
                      Some color pairs have low contrast and may be hard to read. Saving will
                      auto-adjust them.
                    </p>
                    <ul className="mt-2 space-y-1 text-[11.5px] text-[#7c2d12]">
                      {brandAccessibilityIssues.map((issue) => (
                        <li key={`${issue.token}-${issue.against}`}>
                          `{issue.token}` vs `{issue.against}` contrast {issue.ratio.toFixed(2)}{' '}
                          (needs at least {issue.minimum.toFixed(1)})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-[#dcfce7] bg-[#f0fdf4] p-3 text-[11.5px] text-[#166534]">
                    Accessibility check passed for current palette.
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-[#e8e6e3] bg-[#faf9f7] px-3 py-2.5">
                <p className="text-[11.5px] text-[#6b6b6b]">
                  Step order: choose logo, review colors, then save all branding changes.
                </p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void saveBranding()}
                  className="rounded-lg bg-[#121212] px-4 py-2 text-[12px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Save branding
                </button>
              </div>
            </div>
          ) : null}

          {tab === 'general' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">General settings</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                System-wide defaults for your organisation.
              </p>

              <div className="mt-2 border-t border-[#d8d8d8]">
                <label className="block border-b border-[#d8d8d8] py-4">
                  <span className="text-[13.5px] font-medium text-[#121212]">
                    Default timezone (rota &amp; calendar)
                  </span>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                    IANA name (e.g. <span className="font-mono">Europe/London</span>). Leave empty
                    to use each viewer&apos;s device time. Used when displaying shift times on web
                    and mobile.
                  </p>
                  <input
                    className="mt-2 w-full max-w-md rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Europe/London"
                    autoComplete="off"
                  />
                </label>
                <div className="flex items-start justify-between gap-5 border-b border-[#d8d8d8] py-4">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">
                      Default in-app notifications
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                      New members start with notifications enabled for broadcasts and updates unless
                      they change this in their profile.
                    </p>
                  </div>
                  <Toggle on={notif} onToggle={() => setNotif((v) => !v)} disabled={loading} />
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-[#9b9b9b]">
                Member approvals, broadcast approval queues, and role capabilities are enforced by
                permissions today - additional organisation policy toggles may appear here later.
              </p>

              <button
                type="button"
                disabled={loading}
                onClick={() => void saveGeneral()}
                className="mt-6 rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save settings
              </button>
            </div>
          ) : null}

          {tab === 'celebrations' ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
                <div className="font-authSerif text-[17px] text-[#121212]">Public holidays</div>
                <p className="mt-1 text-[13px] text-[#6b6b6b]">
                  Choose your country, then search official holidays to turn on built-in celebrations or add
                  custom ones. Official dates refresh in the background when you open this tab. Use{' '}
                  <span className="font-medium text-[#121212]">Save celebrations</span> at the bottom to keep
                  changes.
                </p>
                {calendarificPreview?.migrationPending ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
                    <strong>Database migration required</strong> before public holidays can load. From the
                    repo root run one of:
                    {calendarificPreview.commands?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-[11px] text-amber-900/95">
                        {calendarificPreview.commands.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 font-mono text-[11px]">npm run supabase:db:push</p>
                    )}
                    <p className="mt-2 text-[11px] text-amber-900/85">
                      File:{' '}
                      <code className="rounded bg-white/70 px-1">
                        {calendarificPreview.migrationFile ??
                          'supabase/migrations/20260804120000_calendarific_celebration_cache.sql'}
                      </code>{' '}
                      — then reload this page.
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <label className="min-w-0 flex-1 max-w-md">
                    <span className="text-[12px] font-medium text-[#121212]">Country for public holidays</span>
                    <FormSelect
                      wrapperClassName="mt-1"
                      controlSize="sm"
                      value={celebrationHolidayCountry}
                      onChange={(e) => setCelebrationHolidayCountry(e.target.value.toUpperCase())}
                    >
                      {!CELEBRATION_HOLIDAY_COUNTRY_OPTIONS.some((c) => c.code === celebrationHolidayCountry) ? (
                        <option value={celebrationHolidayCountry}>
                          {celebrationHolidayCountry} (current)
                        </option>
                      ) : null}
                      {CELEBRATION_HOLIDAY_COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <button
                    type="button"
                    disabled={
                      publicHolidayDatesRefreshing || loading || calendarificPreview?.migrationPending
                    }
                    onClick={() => void syncOfficialHolidayDates({ forceRefreshCache: false, silent: false })}
                    className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6] disabled:opacity-50"
                  >
                    {publicHolidayDatesRefreshing ? 'Refreshing…' : 'Refresh official dates'}
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-[11.5px] text-[#9b9b9b]">
                  {holidayDateRefreshNote ? (
                    <p className="text-[#b45309]">{holidayDateRefreshNote}</p>
                  ) : null}
                  <p>
                    {publicHolidayDatesRefreshing ||
                    (calendarificLoading && !(calendarificPreview?.holidays?.length ?? 0)) ? (
                      <>Checking official public-holiday dates…</>
                    ) : calendarificPreview?.orgLastSyncedAt ? (
                      <>
                        Official dates last checked:{' '}
                        {new Date(calendarificPreview.orgLastSyncedAt).toLocaleString()}.
                      </>
                    ) : initial.celebration_holidays_last_synced_at ? (
                      <>
                        Official dates last checked:{' '}
                        {new Date(initial.celebration_holidays_last_synced_at).toLocaleString()}.
                      </>
                    ) : calendarificPreview?.needsSync ? (
                      <>Loading holiday names for your country…</>
                    ) : (
                      <>Official dates update in the background when you open this tab.</>
                    )}
                  </p>
                </div>

                <div className="mt-5">
                  <label className="block">
                    <span className="text-[12px] font-medium text-[#121212]">Find a holiday</span>
                    <input
                      className="mt-1 w-full max-w-lg rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                      placeholder="e.g. Christmas, bank holiday, 2026-01-01"
                      value={holidaySearchQuery}
                      onChange={(e) => setHolidaySearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  {!holidaySearchDebounced ? (
                    <p className="mt-2 text-[12px] leading-relaxed text-[#9b9b9b]">
                      Type a name or date (YYYY-MM-DD). Built-in celebrations can be turned on in one tap.
                      Everything else can be added as custom, edited, or removed from here.
                    </p>
                  ) : publicHolidaySearchResults.length === 0 ? (
                    <p className="mt-2 text-[12px] text-[#9b9b9b]">
                      No matches. Try different words or another date format.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {publicHolidaySearchResults.map((h) => {
                        const builtin = h.matchedBuiltin;
                        const customModeKey = customModeKeyFromHolidayName(h.name);
                        const existingCustomRow = celebrationModes.find(
                          (mode) => mode.mode_key === customModeKey
                        );
                        const builtinLabel = builtin
                          ? CELEBRATION_MODE_OPTIONS.find((o) => o.id === builtin)?.label ?? String(builtin)
                          : null;
                        const row =
                          builtin &&
                          getCelebrationEditorRow(
                            builtin,
                            builtinLabel ?? String(builtin),
                            CELEBRATION_MODE_OPTIONS.findIndex((o) => o.id === builtin) + 1
                          );
                        const dateLabel =
                          h.iso &&
                          (() => {
                            try {
                              return new Date(`${h.iso}T12:00:00`).toLocaleDateString(undefined, {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              });
                            } catch {
                              return h.iso;
                            }
                          })();
                        return (
                          <li
                            key={`${h.iso ?? 'nodate'}-${h.name}`}
                            className="flex flex-col gap-2 rounded-lg border border-[#eceae6] bg-[#faf9f7] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-[#121212]">{h.name}</div>
                              <div className="text-[11.5px] text-[#6b6b6b]">
                                {dateLabel ?? 'Date not available'}
                                {builtinLabel ? ` · Matches “${builtinLabel}”` : null}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {builtin && row ? (
                                row.is_enabled ? (
                                  <span className="self-center text-[11.5px] text-[#6b6b6b]">Already on</span>
                                ) : (
                                  <button
                                    type="button"
                                    className="rounded-md bg-[#121212] px-3 py-1.5 text-[12px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
                                    onClick={() => enableBuiltinFromHolidaySearch(builtin)}
                                  >
                                    Turn on {builtinLabel}
                                  </button>
                                )
                              ) : null}
                              {!builtin && h.iso ? (
                                existingCustomRow ? (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded-md border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                                      onClick={() =>
                                        setSelectedCelebrationModeKey(existingCustomRow.mode_key)
                                      }
                                    >
                                      Open custom celebration
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 text-[12px] font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                                      onClick={() => void removeMode(existingCustomRow.mode_key)}
                                    >
                                      Remove
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="rounded-md border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                                    onClick={() => addPublicHolidayAsCustom(h)}
                                  >
                                    Add as custom celebration
                                  </button>
                                )
                              ) : !builtin && !h.iso ? (
                                <span className="self-center text-[11px] text-[#9b9b9b]">
                                  No fixed date — create a custom mode below with your own dates
                                </span>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <details className="mt-4 rounded-lg border border-[#eceae6] bg-[#fafaf9] px-3 py-2 text-[12px] text-[#6b6b6b]">
                  <summary className="cursor-pointer font-medium text-[#121212]">Dates look wrong?</summary>
                  <p className="mt-2 text-[11.5px] leading-relaxed">
                    Use <span className="font-medium">Refresh official dates</span> first. If the list still
                    looks stale, you can force a full reload (slower).
                  </p>
                  <button
                    type="button"
                    disabled={
                      publicHolidayDatesRefreshing || loading || calendarificPreview?.migrationPending
                    }
                    className="mt-2 rounded-md border border-[#d8d8d8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#121212] hover:bg-[#faf9f6] disabled:opacity-50"
                    onClick={() => {
                      if (
                        typeof window !== 'undefined' &&
                        !window.confirm(
                          'Fetch the latest public-holiday list? This may take a few seconds.'
                        )
                      ) {
                        return;
                      }
                      void syncOfficialHolidayDates({ forceRefreshCache: true, silent: false });
                    }}
                  >
                    Force full reload
                  </button>
                </details>
              </div>

              <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-5">
                <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
                  <div className="font-authSerif text-[17px] text-[#121212]">Celebration modes</div>
                  <p className="mt-1 text-[13px] text-[#6b6b6b]">
                    Edit one celebration at a time so timing, colours, and emoji are easier to
                    manage.
                  </p>
                  <div className="mt-4 rounded-xl border border-[#e8e6e3] bg-[#faf9f7] p-4">
                    <div className="text-[12.5px] font-medium text-[#121212]">
                      Create custom mode
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                      Add your own organisation-specific celebration if the built-in list does not
                      fit.
                    </p>
                    <div className="mt-3 grid gap-2">
                      <input
                        className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                        placeholder="Short key (e.g. founders_day)"
                        value={newModeKey}
                        onChange={(e) => setNewModeKey(e.target.value)}
                      />
                      <input
                        className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                        placeholder="Label (e.g. Founders Day)"
                        value={newModeLabel}
                        onChange={(e) => setNewModeLabel(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addCustomModeDraft}
                      className="mt-3 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                    >
                      Add custom mode
                    </button>
                    <div className="mt-4 rounded-lg border border-[#eceae6] bg-white p-3">
                      <div className="text-[12px] font-medium text-[#121212]">
                        Your custom celebrations ({customCelebrationModes.length})
                      </div>
                      {customCelebrationModes.length === 0 ? (
                        <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                          No custom celebrations yet.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {customCelebrationModes.map((mode) => (
                            <li
                              key={mode.mode_key}
                              className="flex items-center justify-between gap-2 rounded-md border border-[#eceae6] bg-[#faf9f7] px-2.5 py-2"
                            >
                              <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left text-[12px] font-medium text-[#121212] underline-offset-2 hover:underline"
                                onClick={() => setSelectedCelebrationModeKey(mode.mode_key)}
                              >
                                {mode.label}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-1 text-[11px] font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                                onClick={() => void removeMode(mode.mode_key)}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
                  <div className="border-b border-[#eceae6] px-5 py-4">
                    <div className="text-[13px] font-semibold text-[#121212]">
                      Choose a celebration
                    </div>
                    <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                      Select a mode to edit its timing, look, and emoji.
                    </p>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
                    {celebrationModeGroups.map(([category, modes]) => (
                      <div key={category} className="mb-4 last:mb-0">
                        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">
                          {category}
                        </div>
                        <div className="space-y-2">
                          {modes.map((mode) => {
                            const modeIndex = celebrationModeEntries.findIndex(
                              (entry) => entry.id === mode.id
                            );
                            const row = getCelebrationEditorRow(mode.id, mode.label, modeIndex + 1);
                            const def = getCelebrationModeDef(
                              mode.id as Parameters<typeof getCelebrationModeAdminDefaults>[0],
                              celebrationModes
                            );
                            const isSelected = mode.id === selectedCelebrationModeKey;

                            return (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() => setSelectedCelebrationModeKey(mode.id)}
                                className={[
                                  'w-full rounded-xl border p-3 text-left transition-colors',
                                  isSelected
                                    ? 'border-[#121212] bg-[#faf9f7]'
                                    : 'border-[#eceae6] bg-white hover:border-[#cfcac3] hover:bg-[#fcfbf8]',
                                ].join(' ')}
                              >
                                <div
                                  className="h-9 rounded-lg border border-black/5"
                                  style={
                                    def.gradient
                                      ? { backgroundImage: def.gradient }
                                      : { background: '#f3f4f6' }
                                  }
                                />
                                <div className="mt-3 flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-[13px] font-semibold text-[#121212]">
                                      {row.label}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-[#9b9b9b]">
                                      {getCelebrationTimingSummary(row)}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                                      row.is_enabled
                                        ? 'bg-[#ecfdf3] text-[#166534]'
                                        : 'bg-[#f3f4f6] text-[#6b7280]',
                                    ].join(' ')}
                                  >
                                    {row.is_enabled ? 'On' : 'Off'}
                                  </span>
                                </div>
                                <div className="mt-2 flex gap-1.5 text-[15px]">
                                  {def.decorations.slice(0, 2).map((emoji, idx) => (
                                    <span
                                      key={`${mode.id}-emoji-${idx}`}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#faf5ef]"
                                    >
                                      {emoji}
                                    </span>
                                  ))}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#e8e6e3] bg-[#faf9f7] p-4">
                  <p className="text-[11.5px] leading-relaxed text-[#6b6b6b]">
                    Keep labels human-friendly, and only create custom celebrations when the
                    built-in list does not cover what your organisation needs.
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void saveCelebrations()}
                    className="mt-4 w-full rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Save celebrations
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
                {selectedCelebrationRow && selectedCelebrationDef ? (
                  <>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-authSerif text-[17px] text-[#121212]">
                          {selectedCelebrationRow.label}
                        </div>
                        <p className="mt-1 text-[13px] text-[#6b6b6b]">
                          Make simple updates to this celebration&apos;s timing, look, and emoji.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 rounded-full border border-[#eceae6] bg-[#faf9f7] px-3 py-2">
                        <span className="text-[12px] font-medium text-[#121212]">
                          {selectedCelebrationRow.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Toggle
                          on={selectedCelebrationRow.is_enabled}
                          onToggle={() =>
                            setModeField(
                              selectedCelebrationRow.mode_key,
                              'is_enabled',
                              !selectedCelebrationRow.is_enabled,
                              selectedCelebrationRow.label,
                              selectedCelebrationIndex + 1
                            )
                          }
                        />
                      </div>
                    </div>

                    <div
                      className="mt-5 overflow-hidden rounded-2xl border border-[#e8e6e3]"
                      style={
                        selectedCelebrationDef.gradient
                          ? { backgroundImage: selectedCelebrationDef.gradient }
                          : { background: '#f3f4f6' }
                      }
                    >
                      <div className="bg-black/15 px-5 py-6 text-white backdrop-blur-[1px]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
                          {selectedCelebrationMeta?.category}
                        </div>
                        <div className="mt-2 font-authSerif text-[30px] leading-tight">
                          {selectedCelebrationRow.label}
                        </div>
                        <p className="mt-2 text-[13px] text-white/90">
                          {getCelebrationTimingSummary(selectedCelebrationRow)}
                        </p>
                        <div className="mt-4 flex gap-2 text-[22px]">
                          {selectedCelebrationDef.decorations.slice(0, 2).map((emoji, idx) => (
                            <span
                              key={`${selectedCelebrationRow.mode_key}-preview-${idx}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/20"
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="rounded-xl border border-[#eceae6] bg-[#faf9f7] p-4">
                        <span className="text-[13px] font-medium text-[#121212]">Name</span>
                        <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                          This is what admins and staff will see in the interface.
                        </p>
                        <input
                          className="mt-3 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                          value={selectedCelebrationRow.label}
                          onChange={(e) =>
                            setModeField(
                              selectedCelebrationRow.mode_key,
                              'label',
                              e.target.value,
                              selectedCelebrationRow.label,
                              selectedCelebrationIndex + 1
                            )
                          }
                          placeholder="Celebration name"
                        />
                      </label>

                      <div className="rounded-xl border border-[#eceae6] bg-[#faf9f7] p-4">
                        <span className="text-[13px] font-medium text-[#121212]">
                          When it shows
                        </span>
                        <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                          {selectedCelebrationRow.mode_key.startsWith('org_custom:')
                            ? 'Custom celebrations need a start and end date before they can appear.'
                            : 'Leave these blank to use built-in timing (or dates from Calendarific sync). Set your own dates only when you want a custom window.'}
                        </p>
                        {!selectedCelebrationRow.mode_key.startsWith('org_custom:') ? (
                          <button
                            type="button"
                            onClick={() => {
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'auto_start_month',
                                null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              );
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'auto_start_day',
                                null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              );
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'auto_end_month',
                                null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              );
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'auto_end_day',
                                null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              );
                            }}
                            className="mt-3 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                          >
                            Use standard holiday dates
                          </button>
                        ) : null}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-[12px] text-[#6b6b6b]">
                            Start month
                            <FormSelect
                              wrapperClassName="mt-1"
                              value={selectedCelebrationRow.auto_start_month ?? ''}
                              onChange={(e) =>
                                setModeField(
                                  selectedCelebrationRow.mode_key,
                                  'auto_start_month',
                                  e.target.value ? Number(e.target.value) : null,
                                  selectedCelebrationRow.label,
                                  selectedCelebrationIndex + 1
                                )
                              }
                            >
                              <option value="">Default / unset</option>
                              {MONTH_OPTIONS.map((month) => (
                                <option key={month.value} value={month.value}>
                                  {month.label}
                                </option>
                              ))}
                            </FormSelect>
                          </label>
                          <label className="text-[12px] text-[#6b6b6b]">
                            Start day
                            <FormSelect
                              wrapperClassName="mt-1"
                              value={selectedCelebrationRow.auto_start_day ?? ''}
                              onChange={(e) =>
                                setModeField(
                                  selectedCelebrationRow.mode_key,
                                  'auto_start_day',
                                  e.target.value ? Number(e.target.value) : null,
                                  selectedCelebrationRow.label,
                                  selectedCelebrationIndex + 1
                                )
                              }
                            >
                              <option value="">Default / unset</option>
                              {DAY_OPTIONS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </FormSelect>
                          </label>
                          <label className="text-[12px] text-[#6b6b6b]">
                            End month
                            <FormSelect
                              wrapperClassName="mt-1"
                              value={selectedCelebrationRow.auto_end_month ?? ''}
                              onChange={(e) =>
                                setModeField(
                                  selectedCelebrationRow.mode_key,
                                  'auto_end_month',
                                  e.target.value ? Number(e.target.value) : null,
                                  selectedCelebrationRow.label,
                                  selectedCelebrationIndex + 1
                                )
                              }
                            >
                              <option value="">Default / unset</option>
                              {MONTH_OPTIONS.map((month) => (
                                <option key={month.value} value={month.value}>
                                  {month.label}
                                </option>
                              ))}
                            </FormSelect>
                          </label>
                          <label className="text-[12px] text-[#6b6b6b]">
                            End day
                            <FormSelect
                              wrapperClassName="mt-1"
                              value={selectedCelebrationRow.auto_end_day ?? ''}
                              onChange={(e) =>
                                setModeField(
                                  selectedCelebrationRow.mode_key,
                                  'auto_end_day',
                                  e.target.value ? Number(e.target.value) : null,
                                  selectedCelebrationRow.label,
                                  selectedCelebrationIndex + 1
                                )
                              }
                            >
                              <option value="">Default / unset</option>
                              {DAY_OPTIONS.map((day) => (
                                <option key={day} value={day}>
                                  {day}
                                </option>
                              ))}
                            </FormSelect>
                          </label>
                        </div>
                        <p className="mt-3 text-[11.5px] text-[#6b6b6b]">
                          {selectedCelebrationUsesCustomWindow
                            ? `Current custom window: ${getCelebrationTimingSummary(selectedCelebrationRow)}`
                            : `Current schedule: ${getCelebrationTimingSummary(selectedCelebrationRow)}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl border border-[#eceae6] bg-[#faf9f7] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-[13px] font-medium text-[#121212]">
                            Look and feel
                          </div>
                          <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                            Pick your own colours and direction. We&apos;ll build the gradient for
                            you.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setModeField(
                              selectedCelebrationRow.mode_key,
                              'gradient_override',
                              selectedCelebrationRow.mode_key.startsWith('org_custom:')
                                ? DEFAULT_CUSTOM_CELEBRATION_GRADIENT
                                : null,
                              selectedCelebrationRow.label,
                              selectedCelebrationIndex + 1
                            )
                          }
                          className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                        >
                          {selectedCelebrationRow.mode_key.startsWith('org_custom:')
                            ? 'Reset custom colours'
                            : 'Use standard colours'}
                        </button>
                      </div>
                      <div className="mt-4 overflow-hidden rounded-2xl border border-[#e4e0da] bg-white">
                        <div
                          className="h-24 w-full"
                          style={{
                            backgroundImage: selectedCelebrationGradientPreview,
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2 border-t border-[#eceae6] px-4 py-3">
                          {[
                            selectedCelebrationGradientBuilder.start,
                            ...(selectedCelebrationGradientBuilder.hasMiddle
                              ? [selectedCelebrationGradientBuilder.middle]
                              : []),
                            selectedCelebrationGradientBuilder.end,
                          ].map((color, idx) => (
                            <span
                              key={`${selectedCelebrationRow.mode_key}-gradient-chip-${idx}`}
                              className="inline-flex items-center gap-2 rounded-full border border-[#e4e0da] bg-[#faf9f7] px-2.5 py-1 text-[11px] font-medium text-[#121212]"
                            >
                              <span
                                className="h-3 w-3 rounded-full border border-black/10"
                                style={{ backgroundColor: color }}
                              />
                              {color}
                            </span>
                          ))}
                          <span className="text-[11px] text-[#8a867f]">
                            Direction: {selectedCelebrationGradientBuilder.angle}deg
                          </span>
                        </div>
                      </div>
                      {selectedCelebrationGradientBuilder.sourceStopCount > 3 ? (
                        <p className="mt-3 text-[11.5px] text-[#6b6b6b]">
                          This celebration currently uses a more detailed multi-colour gradient. If
                          you change it here, it will be simplified into an easy-to-edit blend.
                        </p>
                      ) : null}
                      <div className="mt-4 rounded-xl border border-[#e4e0da] bg-white p-4">
                        <div className="text-[12px] font-medium text-[#121212]">Direction</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          {GRADIENT_DIRECTION_OPTIONS.map((option) => {
                            const isActive =
                              selectedCelebrationGradientBuilder.angle === option.angle;
                            return (
                              <button
                                key={option.angle}
                                type="button"
                                onClick={() => updateCelebrationGradient({ angle: option.angle })}
                                className={[
                                  'rounded-lg border px-3 py-2 text-left text-[12px] font-medium transition-colors',
                                  isActive
                                    ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
                                    : 'border-[#dedad4] bg-[#faf9f7] text-[#121212] hover:bg-[#f5f4f1]',
                                ].join(' ')}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <label className="mt-4 block text-[12px] text-[#6b6b6b]">
                          Fine tune angle
                          <input
                            type="range"
                            min={0}
                            max={360}
                            step={1}
                            value={selectedCelebrationGradientBuilder.angle}
                            onChange={(e) =>
                              updateCelebrationGradient({ angle: Number(e.target.value) })
                            }
                            className="mt-2 w-full accent-[#121212]"
                          />
                        </label>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <GradientColorInput
                          label="First colour"
                          value={selectedCelebrationGradientBuilder.start}
                          onChange={(value) =>
                            updateCelebrationGradient({ start: value.toLowerCase() })
                          }
                        />
                        <GradientColorInput
                          label="Last colour"
                          value={selectedCelebrationGradientBuilder.end}
                          onChange={(value) =>
                            updateCelebrationGradient({ end: value.toLowerCase() })
                          }
                        />
                      </div>
                      <div className="mt-4 rounded-xl border border-[#e4e0da] bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[12px] font-medium text-[#121212]">
                              Middle colour
                            </div>
                            <p className="mt-1 text-[11px] text-[#8a867f]">
                              Add a third colour if you want a richer gradient.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateCelebrationGradient({
                                hasMiddle: !selectedCelebrationGradientBuilder.hasMiddle,
                              })
                            }
                            className="rounded-lg border border-[#d8d8d8] bg-[#faf9f7] px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
                          >
                            {selectedCelebrationGradientBuilder.hasMiddle
                              ? 'Use 2 colours'
                              : 'Add third colour'}
                          </button>
                        </div>
                        {selectedCelebrationGradientBuilder.hasMiddle ? (
                          <div className="mt-4">
                            <GradientColorInput
                              label="Middle colour"
                              value={selectedCelebrationGradientBuilder.middle}
                              hideLabel
                              onChange={(value) =>
                                updateCelebrationGradient({ middle: value.toLowerCase() })
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl border border-[#eceae6] bg-[#faf9f7] p-4">
                      <div className="text-[13px] font-medium text-[#121212]">Emoji</div>
                      <p className="mt-1 text-[11.5px] text-[#6b6b6b]">
                        These are used for the celebration accents and quick preview chips.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-[12px] text-[#6b6b6b]">
                          Primary emoji
                          <input
                            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
                            value={selectedCelebrationRow.emoji_primary ?? ''}
                            onChange={(e) =>
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'emoji_primary',
                                e.target.value || null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              )
                            }
                            placeholder={selectedCelebrationDef.decorations[0] ?? '✨'}
                          />
                        </label>
                        <label className="text-[12px] text-[#6b6b6b]">
                          Secondary emoji
                          <input
                            className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212]"
                            value={selectedCelebrationRow.emoji_secondary ?? ''}
                            onChange={(e) =>
                              setModeField(
                                selectedCelebrationRow.mode_key,
                                'emoji_secondary',
                                e.target.value || null,
                                selectedCelebrationRow.label,
                                selectedCelebrationIndex + 1
                              )
                            }
                            placeholder={selectedCelebrationDef.decorations[1] ?? '🎉'}
                          />
                        </label>
                      </div>
                    </div>

                    {selectedCelebrationRow.mode_key.startsWith('org_custom:') ? (
                      <div className="mt-6 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void removeMode(selectedCelebrationRow.mode_key)}
                          className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                        >
                          Remove custom mode
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#d8d8d8] bg-[#faf9f7] p-8 text-center text-[13px] text-[#6b6b6b]">
                    Choose a celebration from the left to edit it.
                  </div>
                )}
              </div>
            </div>
            </div>
          ) : null}

          {tab === 'danger' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#b91c1c]">Danger zone</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                These actions have serious impact. Proceed with caution.
              </p>

              <div className="mt-2 border-t border-[#d8d8d8]">
                <div className="flex flex-col gap-4 border-b border-[#d8d8d8] py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">
                      Export all member data
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                      Download a CSV of members (up to 5000 rows) for your records.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void exportMemberCsv()}
                    className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
                  >
                    {exporting ? 'Preparing...' : 'Export CSV'}
                  </button>
                </div>

                <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#121212]">
                      Request deactivation
                    </div>
                    <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                      Records a request to wind down the org. Common Ground Studios follows up
                      off-platform; data is not immediately deleted.
                    </p>
                    {initial.deactivation_requested_at ? (
                      <p className="mt-2 text-[11px] text-[#9b9b9b]">
                        Requested {new Date(initial.deactivation_requested_at).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {initial.deactivation_requested_at ? null : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void requestDeactivation()}
                      className="shrink-0 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] font-medium text-[#b91c1c] hover:bg-[#fee2e2] disabled:opacity-50"
                    >
                      Request deactivation
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {cropModalOpen && pendingLogoPreviewUrl ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#d8d8d8] bg-white p-4 shadow-xl">
            <div className="font-authSerif text-[18px] text-[#121212]">Crop logo</div>
            <p className="mt-1 text-[12px] text-[#6b6b6b]">
              Drag the image to reposition and use zoom to frame it nicely in the square logo.
            </p>
            <div className="mt-3 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
              <div
                className={[
                  'relative mx-auto h-64 w-64 overflow-hidden rounded-xl border border-[#d8d8d8] bg-white',
                  isDraggingCrop ? 'cursor-grabbing' : 'cursor-grab',
                ].join(' ')}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={handleCropPointerUp}
              >
                <img
                  src={pendingLogoPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{
                    transform: `translate(${cropX}%, ${cropY}%) scale(${cropZoom})`,
                    transformOrigin: 'center',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 border-2 border-white/75 shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.12)]" />
                <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/65" />
                <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/65" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="text-[11.5px] text-[#6b6b6b]">
                  Horizontal
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={cropX}
                    onChange={(e) => setCropX(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="text-[11.5px] text-[#6b6b6b]">
                  Vertical
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    step={1}
                    value={cropY}
                    onChange={(e) => setCropY(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="text-[11.5px] text-[#6b6b6b]">
                  Zoom
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={cropZoom}
                    onChange={(e) => setCropZoom(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-[#9b9b9b]">
                  Tip: keep key details near the center crosshair.
                </p>
                <button
                  type="button"
                  className="rounded-md border border-[#d8d8d8] bg-white px-2 py-1 text-[11px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
                  onClick={() => {
                    setCropX(0);
                    setCropY(0);
                    setCropZoom(1);
                  }}
                >
                  Reset crop
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12px] font-medium text-[#6b6b6b]"
                onClick={() => {
                  setCropModalOpen(false);
                  setPendingLogoFile(null);
                  if (logoFileInputRef.current) logoFileInputRef.current.value = '';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#121212] px-3 py-2 text-[12px] font-medium text-[#faf9f6]"
                onClick={() => void applyCroppedUpload()}
              >
                Crop and upload
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {msg ? (
        <div className="pointer-events-none fixed inset-x-0 top-5 z-[140] flex justify-end px-5 sm:px-7 xl:px-9">
          <div
            className={[
              'pointer-events-auto max-w-[360px] rounded-xl border px-4 py-3 text-[13px] shadow-[0_18px_40px_rgba(0,0,0,0.12)]',
              msgTone === 'err'
                ? 'border-[#fecaca] bg-[#fff5f5] text-[#b91c1c]'
                : 'border-[#bbf7d0] bg-white text-[#166534]',
            ].join(' ')}
          >
            {msg}
          </div>
        </div>
      ) : null}
    </div>
  );
}
