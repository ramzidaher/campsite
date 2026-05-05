export type BuiltInCelebrationMode =
  | 'off'
  | 'pride'
  | 'new_years_day'
  | 'valentines_day'
  | 'international_womens_day'
  | 'earth_day'
  | 'christmas'
  | 'easter'
  | 'good_friday'
  | 'palm_sunday'
  | 'hanukkah'
  | 'passover'
  | 'rosh_hashanah'
  | 'yom_kippur'
  | 'eid_al_fitr'
  | 'eid_al_adha'
  | 'ramadan'
  | 'diwali'
  | 'holi'
  | 'lunar_new_year'
  | 'vesak'
  | 'halloween'
  | 'thanksgiving'
  | 'black_friday'
  | 'mothers_day'
  | 'fathers_day'
  | 'boxing_day'
  | 'bonfire_night'
  | 'early_may_bank_holiday';

export type CelebrationMode = BuiltInCelebrationMode | `org_custom:${string}`;

export type CelebrationModeCategory =
  | 'Universal / Global'
  | 'Christian Holidays'
  | 'Jewish Holidays'
  | 'Islamic Holidays'
  | 'Hindu & Other Asian Holidays'
  | 'Popular Cultural Holidays'
  | 'UK-Specific'
  | 'Organisation custom';

export type CelebrationModeDef = {
  id: CelebrationMode;
  label: string;
  category: CelebrationModeCategory;
  gradient: string | null;
  decorations: string[];
  isActiveNow: (now: Date) => boolean;
};

export type OrgCelebrationModeOverride = {
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

export type CelebrationModeAdminDefaults = {
  auto_start_month: number | null;
  auto_start_day: number | null;
  auto_end_month: number | null;
  auto_end_day: number | null;
  gradient_override: string | null;
  emoji_primary: string | null;
  emoji_secondary: string | null;
};

type DateWindow = { month: number; dayStart: number; dayEnd: number };

function inWindow(now: Date, w: DateWindow): boolean {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return m === w.month && d >= w.dayStart && d <= w.dayEnd;
}

function anyWindow(now: Date, windows: DateWindow[]): boolean {
  return windows.some((w) => inWindow(now, w));
}

function fixedWindow(month: number, dayStart: number, dayEnd = dayStart) {
  return (now: Date) => inWindow(now, { month, dayStart, dayEnd });
}

function byWindows(windows: DateWindow[]) {
  return (now: Date) => anyWindow(now, windows);
}

function startOfDayLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWithinDateRange(now: Date, start: Date, end: Date): boolean {
  const target = startOfDayLocal(now).getTime();
  const min = startOfDayLocal(start).getTime();
  const max = startOfDayLocal(end).getTime();
  return target >= min && target <= max;
}

// Gregorian computus for Western Easter Sunday.
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function easterWindow(offsetStartDays: number, offsetEndDays: number) {
  return (now: Date) => {
    const easter = getEasterSunday(now.getFullYear());
    return isWithinDateRange(now, addDays(easter, offsetStartDays), addDays(easter, offsetEndDays));
  };
}

const MODE_DEFS: CelebrationModeDef[] = [
  { id: 'off', label: 'Off', category: 'Universal / Global', gradient: null, decorations: [], isActiveNow: () => false },
  {
    id: 'pride',
    label: 'Pride mode',
    category: 'Universal / Global',
    gradient: 'linear-gradient(180deg,#e40303 0%,#ff8c00 16.66%,#ffed00 33.33%,#008026 50%,#004dff 66.66%,#750787 83.33%,#e40303 100%)',
    decorations: ['🏳️‍🌈', '✨'],
    isActiveNow: byWindows([{ month: 6, dayStart: 1, dayEnd: 30 }]),
  },
  {
    id: 'new_years_day',
    label: "New Year's Day",
    category: 'Universal / Global',
    gradient: 'linear-gradient(180deg,#1b2735 0%,#2c5364 55%,#4ca1af 100%)',
    decorations: ['🎆', '🎉'],
    isActiveNow: byWindows([{ month: 1, dayStart: 1, dayEnd: 3 }]),
  },
  {
    id: 'valentines_day',
    label: "Valentine's Day",
    category: 'Universal / Global',
    gradient: 'linear-gradient(180deg,#7f1d1d 0%,#be123c 55%,#fb7185 100%)',
    decorations: ['💖', '🌹'],
    isActiveNow: byWindows([{ month: 2, dayStart: 12, dayEnd: 15 }]),
  },
  {
    id: 'international_womens_day',
    label: "International Women's Day",
    category: 'Universal / Global',
    gradient: 'linear-gradient(180deg,#4c1d95 0%,#7e22ce 55%,#c084fc 100%)',
    decorations: ['💜', '🌸'],
    isActiveNow: byWindows([{ month: 3, dayStart: 8, dayEnd: 10 }]),
  },
  {
    id: 'earth_day',
    label: 'Earth Day',
    category: 'Universal / Global',
    gradient: 'linear-gradient(180deg,#0f766e 0%,#15803d 55%,#65a30d 100%)',
    decorations: ['🌍', '🌱'],
    isActiveNow: byWindows([{ month: 4, dayStart: 21, dayEnd: 23 }]),
  },
  {
    id: 'christmas',
    label: 'Christmas',
    category: 'Christian Holidays',
    gradient: 'linear-gradient(180deg,#7f1d1d 0%,#14532d 50%,#facc15 100%)',
    decorations: ['🎄', '✨'],
    isActiveNow: byWindows([{ month: 12, dayStart: 20, dayEnd: 27 }]),
  },
  {
    id: 'easter',
    label: 'Easter',
    category: 'Christian Holidays',
    gradient: 'linear-gradient(180deg,#fce7f3 0%,#f9a8d4 45%,#93c5fd 100%)',
    decorations: ['🥚', '🐇'],
    // Easter Sunday through Easter Monday.
    isActiveNow: easterWindow(0, 1),
  },
  {
    id: 'good_friday',
    label: 'Good Friday',
    category: 'Christian Holidays',
    gradient: 'linear-gradient(180deg,#111827 0%,#374151 55%,#6b7280 100%)',
    decorations: ['✝️', '🕊️'],
    // Good Friday through Holy Saturday.
    isActiveNow: easterWindow(-2, -1),
  },
  {
    id: 'palm_sunday',
    label: 'Palm Sunday',
    category: 'Christian Holidays',
    gradient: 'linear-gradient(180deg,#064e3b 0%,#15803d 50%,#84cc16 100%)',
    decorations: ['🌿', '🕊️'],
    isActiveNow: easterWindow(-7, -7),
  },
  {
    id: 'hanukkah',
    label: 'Hanukkah',
    category: 'Jewish Holidays',
    gradient: 'linear-gradient(180deg,#0f172a 0%,#1d4ed8 50%,#60a5fa 100%)',
    decorations: ['🕎', '✨'],
    isActiveNow: byWindows([{ month: 12, dayStart: 1, dayEnd: 31 }]),
  },
  {
    id: 'passover',
    label: 'Passover',
    category: 'Jewish Holidays',
    gradient: 'linear-gradient(180deg,#78350f 0%,#a16207 50%,#fbbf24 100%)',
    decorations: ['🍷', '✡️'],
    isActiveNow: byWindows([{ month: 3, dayStart: 25, dayEnd: 31 }, { month: 4, dayStart: 1, dayEnd: 30 }]),
  },
  {
    id: 'rosh_hashanah',
    label: 'Rosh Hashanah',
    category: 'Jewish Holidays',
    gradient: 'linear-gradient(180deg,#1e3a8a 0%,#2563eb 50%,#f59e0b 100%)',
    decorations: ['🍎', '🍯'],
    isActiveNow: byWindows([{ month: 9, dayStart: 1, dayEnd: 30 }]),
  },
  {
    id: 'yom_kippur',
    label: 'Yom Kippur',
    category: 'Jewish Holidays',
    gradient: 'linear-gradient(180deg,#111827 0%,#334155 55%,#94a3b8 100%)',
    decorations: ['🕯️', '✡️'],
    isActiveNow: byWindows([{ month: 9, dayStart: 1, dayEnd: 30 }, { month: 10, dayStart: 1, dayEnd: 10 }]),
  },
  {
    id: 'eid_al_fitr',
    label: 'Eid al-Fitr',
    category: 'Islamic Holidays',
    gradient: 'linear-gradient(180deg,#052e16 0%,#166534 50%,#22c55e 100%)',
    decorations: ['🌙', '🕌'],
    isActiveNow: byWindows([{ month: 4, dayStart: 1, dayEnd: 30 }, { month: 5, dayStart: 1, dayEnd: 10 }]),
  },
  {
    id: 'eid_al_adha',
    label: 'Eid al-Adha',
    category: 'Islamic Holidays',
    gradient: 'linear-gradient(180deg,#3f6212 0%,#65a30d 50%,#d9f99d 100%)',
    decorations: ['🕌', '⭐'],
    isActiveNow: byWindows([{ month: 6, dayStart: 1, dayEnd: 30 }]),
  },
  {
    id: 'ramadan',
    label: 'Ramadan',
    category: 'Islamic Holidays',
    gradient: 'linear-gradient(180deg,#0f172a 0%,#1e293b 55%,#7c3aed 100%)',
    decorations: ['🌙', '🕋'],
    isActiveNow: byWindows([{ month: 3, dayStart: 1, dayEnd: 31 }, { month: 4, dayStart: 1, dayEnd: 20 }]),
  },
  {
    id: 'diwali',
    label: 'Diwali',
    category: 'Hindu & Other Asian Holidays',
    gradient: 'linear-gradient(180deg,#7c2d12 0%,#ea580c 50%,#facc15 100%)',
    decorations: ['🪔', '✨'],
    isActiveNow: byWindows([{ month: 10, dayStart: 15, dayEnd: 31 }, { month: 11, dayStart: 1, dayEnd: 20 }]),
  },
  {
    id: 'holi',
    label: 'Holi',
    category: 'Hindu & Other Asian Holidays',
    gradient: 'linear-gradient(180deg,#ec4899 0%,#8b5cf6 35%,#06b6d4 70%,#f59e0b 100%)',
    decorations: ['🎨', '🌸'],
    isActiveNow: byWindows([{ month: 3, dayStart: 1, dayEnd: 31 }]),
  },
  {
    id: 'lunar_new_year',
    label: 'Lunar New Year',
    category: 'Hindu & Other Asian Holidays',
    gradient: 'linear-gradient(180deg,#7f1d1d 0%,#dc2626 50%,#f59e0b 100%)',
    decorations: ['🏮', '🐉'],
    isActiveNow: byWindows([{ month: 1, dayStart: 20, dayEnd: 31 }, { month: 2, dayStart: 1, dayEnd: 20 }]),
  },
  {
    id: 'vesak',
    label: 'Vesak',
    category: 'Hindu & Other Asian Holidays',
    gradient: 'linear-gradient(180deg,#1e3a8a 0%,#0ea5e9 50%,#fde68a 100%)',
    decorations: ['🪷', '🕯️'],
    isActiveNow: byWindows([{ month: 5, dayStart: 1, dayEnd: 31 }]),
  },
  {
    id: 'halloween',
    label: 'Halloween',
    category: 'Popular Cultural Holidays',
    gradient: 'linear-gradient(180deg,#111827 0%,#c2410c 55%,#f97316 100%)',
    decorations: ['🎃', '🕸️'],
    isActiveNow: byWindows([{ month: 10, dayStart: 25, dayEnd: 31 }]),
  },
  {
    id: 'thanksgiving',
    label: 'Thanksgiving',
    category: 'Popular Cultural Holidays',
    gradient: 'linear-gradient(180deg,#78350f 0%,#92400e 50%,#fb923c 100%)',
    decorations: ['🦃', '🍂'],
    isActiveNow: byWindows([{ month: 11, dayStart: 20, dayEnd: 30 }]),
  },
  {
    id: 'black_friday',
    label: 'Black Friday',
    category: 'Popular Cultural Holidays',
    gradient: 'linear-gradient(180deg,#111827 0%,#1f2937 55%,#4b5563 100%)',
    decorations: ['🛍️', '⚡'],
    isActiveNow: byWindows([{ month: 11, dayStart: 23, dayEnd: 30 }]),
  },
  {
    id: 'mothers_day',
    label: "Mother's Day",
    category: 'Popular Cultural Holidays',
    gradient: 'linear-gradient(180deg,#be185d 0%,#ec4899 50%,#fbcfe8 100%)',
    decorations: ['🌷', '💝'],
    isActiveNow: byWindows([{ month: 3, dayStart: 1, dayEnd: 31 }, { month: 5, dayStart: 1, dayEnd: 31 }]),
  },
  {
    id: 'fathers_day',
    label: "Father's Day",
    category: 'Popular Cultural Holidays',
    gradient: 'linear-gradient(180deg,#0f172a 0%,#1d4ed8 50%,#93c5fd 100%)',
    decorations: ['👔', '🎉'],
    isActiveNow: byWindows([{ month: 6, dayStart: 1, dayEnd: 30 }]),
  },
  {
    id: 'boxing_day',
    label: 'Boxing Day',
    category: 'UK-Specific',
    gradient: 'linear-gradient(180deg,#0f172a 0%,#1e40af 50%,#60a5fa 100%)',
    decorations: ['📦', '🎁'],
    isActiveNow: fixedWindow(12, 26, 27),
  },
  {
    id: 'bonfire_night',
    label: 'Bonfire Night',
    category: 'UK-Specific',
    gradient: 'linear-gradient(180deg,#111827 0%,#7c2d12 50%,#f97316 100%)',
    decorations: ['🔥', '🎇'],
    isActiveNow: byWindows([{ month: 11, dayStart: 4, dayEnd: 6 }]),
  },
  {
    id: 'early_may_bank_holiday',
    label: 'Early May Bank Holiday',
    category: 'UK-Specific',
    gradient: 'linear-gradient(180deg,#1d4ed8 0%,#2563eb 50%,#22d3ee 100%)',
    decorations: ['🇬🇧', '🌼'],
    isActiveNow: byWindows([{ month: 5, dayStart: 1, dayEnd: 10 }]),
  },
];

export const CELEBRATION_MODES = MODE_DEFS;
export const CELEBRATION_MODE_IDS = MODE_DEFS.map((m) => m.id) as BuiltInCelebrationMode[];

export const CELEBRATION_MODE_OPTIONS = MODE_DEFS.map((m) => ({
  id: m.id,
  label: m.label,
  category: m.category,
}));

const BUILT_IN_ADMIN_DEFAULTS: Record<BuiltInCelebrationMode, CelebrationModeAdminDefaults> = {
  off: { auto_start_month: null, auto_start_day: null, auto_end_month: null, auto_end_day: null, gradient_override: null, emoji_primary: null, emoji_secondary: null },
  pride: { auto_start_month: 6, auto_start_day: 1, auto_end_month: 6, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#e40303 0%,#ff8c00 16.66%,#ffed00 33.33%,#008026 50%,#004dff 66.66%,#750787 83.33%,#e40303 100%)', emoji_primary: '🏳️‍🌈', emoji_secondary: '✨' },
  new_years_day: { auto_start_month: 1, auto_start_day: 1, auto_end_month: 1, auto_end_day: 3, gradient_override: 'linear-gradient(180deg,#1b2735 0%,#2c5364 55%,#4ca1af 100%)', emoji_primary: '🎆', emoji_secondary: '🎉' },
  valentines_day: { auto_start_month: 2, auto_start_day: 12, auto_end_month: 2, auto_end_day: 15, gradient_override: 'linear-gradient(180deg,#7f1d1d 0%,#be123c 55%,#fb7185 100%)', emoji_primary: '💖', emoji_secondary: '🌹' },
  international_womens_day: { auto_start_month: 3, auto_start_day: 8, auto_end_month: 3, auto_end_day: 10, gradient_override: 'linear-gradient(180deg,#4c1d95 0%,#7e22ce 55%,#c084fc 100%)', emoji_primary: '💜', emoji_secondary: '🌸' },
  earth_day: { auto_start_month: 4, auto_start_day: 21, auto_end_month: 4, auto_end_day: 23, gradient_override: 'linear-gradient(180deg,#0f766e 0%,#15803d 55%,#65a30d 100%)', emoji_primary: '🌍', emoji_secondary: '🌱' },
  christmas: { auto_start_month: 12, auto_start_day: 20, auto_end_month: 12, auto_end_day: 27, gradient_override: 'linear-gradient(180deg,#7f1d1d 0%,#14532d 50%,#facc15 100%)', emoji_primary: '🎄', emoji_secondary: '✨' },
  easter: { auto_start_month: null, auto_start_day: null, auto_end_month: null, auto_end_day: null, gradient_override: 'linear-gradient(180deg,#fce7f3 0%,#f9a8d4 45%,#93c5fd 100%)', emoji_primary: '🥚', emoji_secondary: '🐇' },
  good_friday: { auto_start_month: null, auto_start_day: null, auto_end_month: null, auto_end_day: null, gradient_override: 'linear-gradient(180deg,#111827 0%,#374151 55%,#6b7280 100%)', emoji_primary: '✝️', emoji_secondary: '🕊️' },
  palm_sunday: { auto_start_month: null, auto_start_day: null, auto_end_month: null, auto_end_day: null, gradient_override: 'linear-gradient(180deg,#064e3b 0%,#15803d 50%,#84cc16 100%)', emoji_primary: '🌿', emoji_secondary: '🕊️' },
  hanukkah: { auto_start_month: 12, auto_start_day: 1, auto_end_month: 12, auto_end_day: 31, gradient_override: 'linear-gradient(180deg,#0f172a 0%,#1d4ed8 50%,#60a5fa 100%)', emoji_primary: '🕎', emoji_secondary: '✨' },
  passover: { auto_start_month: 3, auto_start_day: 25, auto_end_month: 4, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#78350f 0%,#a16207 50%,#fbbf24 100%)', emoji_primary: '🍷', emoji_secondary: '✡️' },
  rosh_hashanah: { auto_start_month: 9, auto_start_day: 1, auto_end_month: 9, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#1e3a8a 0%,#2563eb 50%,#f59e0b 100%)', emoji_primary: '🍎', emoji_secondary: '🍯' },
  yom_kippur: { auto_start_month: 9, auto_start_day: 1, auto_end_month: 10, auto_end_day: 10, gradient_override: 'linear-gradient(180deg,#111827 0%,#334155 55%,#94a3b8 100%)', emoji_primary: '🕯️', emoji_secondary: '✡️' },
  eid_al_fitr: { auto_start_month: 4, auto_start_day: 1, auto_end_month: 5, auto_end_day: 10, gradient_override: 'linear-gradient(180deg,#052e16 0%,#166534 50%,#22c55e 100%)', emoji_primary: '🌙', emoji_secondary: '🕌' },
  eid_al_adha: { auto_start_month: 6, auto_start_day: 1, auto_end_month: 6, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#3f6212 0%,#65a30d 50%,#d9f99d 100%)', emoji_primary: '🕌', emoji_secondary: '⭐' },
  ramadan: { auto_start_month: 3, auto_start_day: 1, auto_end_month: 4, auto_end_day: 20, gradient_override: 'linear-gradient(180deg,#0f172a 0%,#1e293b 55%,#7c3aed 100%)', emoji_primary: '🌙', emoji_secondary: '🕋' },
  diwali: { auto_start_month: 10, auto_start_day: 15, auto_end_month: 11, auto_end_day: 20, gradient_override: 'linear-gradient(180deg,#7c2d12 0%,#ea580c 50%,#facc15 100%)', emoji_primary: '🪔', emoji_secondary: '✨' },
  holi: { auto_start_month: 3, auto_start_day: 1, auto_end_month: 3, auto_end_day: 31, gradient_override: 'linear-gradient(180deg,#ec4899 0%,#8b5cf6 35%,#06b6d4 70%,#f59e0b 100%)', emoji_primary: '🎨', emoji_secondary: '🌸' },
  lunar_new_year: { auto_start_month: 1, auto_start_day: 20, auto_end_month: 2, auto_end_day: 20, gradient_override: 'linear-gradient(180deg,#7f1d1d 0%,#dc2626 50%,#f59e0b 100%)', emoji_primary: '🏮', emoji_secondary: '🐉' },
  vesak: { auto_start_month: 5, auto_start_day: 1, auto_end_month: 5, auto_end_day: 31, gradient_override: 'linear-gradient(180deg,#1e3a8a 0%,#0ea5e9 50%,#fde68a 100%)', emoji_primary: '🪷', emoji_secondary: '🕯️' },
  halloween: { auto_start_month: 10, auto_start_day: 25, auto_end_month: 10, auto_end_day: 31, gradient_override: 'linear-gradient(180deg,#111827 0%,#c2410c 55%,#f97316 100%)', emoji_primary: '🎃', emoji_secondary: '🕸️' },
  thanksgiving: { auto_start_month: 11, auto_start_day: 20, auto_end_month: 11, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#78350f 0%,#92400e 50%,#fb923c 100%)', emoji_primary: '🦃', emoji_secondary: '🍂' },
  black_friday: { auto_start_month: 11, auto_start_day: 23, auto_end_month: 11, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#111827 0%,#1f2937 55%,#4b5563 100%)', emoji_primary: '🛍️', emoji_secondary: '⚡' },
  mothers_day: { auto_start_month: 3, auto_start_day: 1, auto_end_month: 5, auto_end_day: 31, gradient_override: 'linear-gradient(180deg,#be185d 0%,#ec4899 50%,#fbcfe8 100%)', emoji_primary: '🌷', emoji_secondary: '💝' },
  fathers_day: { auto_start_month: 6, auto_start_day: 1, auto_end_month: 6, auto_end_day: 30, gradient_override: 'linear-gradient(180deg,#0f172a 0%,#1d4ed8 50%,#93c5fd 100%)', emoji_primary: '👔', emoji_secondary: '🎉' },
  boxing_day: { auto_start_month: 12, auto_start_day: 26, auto_end_month: 12, auto_end_day: 27, gradient_override: 'linear-gradient(180deg,#0f172a 0%,#1e40af 50%,#60a5fa 100%)', emoji_primary: '📦', emoji_secondary: '🎁' },
  bonfire_night: { auto_start_month: 11, auto_start_day: 4, auto_end_month: 11, auto_end_day: 6, gradient_override: 'linear-gradient(180deg,#111827 0%,#7c2d12 50%,#f97316 100%)', emoji_primary: '🔥', emoji_secondary: '🎇' },
  early_may_bank_holiday: { auto_start_month: 5, auto_start_day: 1, auto_end_month: 5, auto_end_day: 10, gradient_override: 'linear-gradient(180deg,#1d4ed8 0%,#2563eb 50%,#22d3ee 100%)', emoji_primary: '🇬🇧', emoji_secondary: '🌼' },
};

export function getCelebrationModeAdminDefaults(mode: CelebrationMode): CelebrationModeAdminDefaults {
  const normalized = normalizeCelebrationMode(mode);
  if (typeof normalized === 'string' && normalized.startsWith('org_custom:')) {
    return {
      auto_start_month: null,
      auto_start_day: null,
      auto_end_month: null,
      auto_end_day: null,
      gradient_override: null,
      emoji_primary: '✨',
      emoji_secondary: '🎉',
    };
  }
  return BUILT_IN_ADMIN_DEFAULTS[normalized as BuiltInCelebrationMode] ?? BUILT_IN_ADMIN_DEFAULTS.off;
}

export function normalizeCelebrationMode(raw: unknown): CelebrationMode {
  if (typeof raw !== 'string') return 'off';
  if (CELEBRATION_MODE_IDS.includes(raw as BuiltInCelebrationMode)) return raw as BuiltInCelebrationMode;
  if (/^org_custom:[a-z0-9_-]+$/i.test(raw)) return raw as CelebrationMode;
  return 'off';
}

function hasCustomDateWindow(override: OrgCelebrationModeOverride): boolean {
  return (
    override.auto_start_month !== null &&
    override.auto_start_day !== null &&
    override.auto_end_month !== null &&
    override.auto_end_day !== null
  );
}

function isInMonthDayWindow(
  now: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  const y = now.getFullYear();
  const current = new Date(y, now.getMonth(), now.getDate()).getTime();
  const start = new Date(y, startMonth - 1, startDay).getTime();
  const end = new Date(y, endMonth - 1, endDay).getTime();
  if (end >= start) return current >= start && current <= end;
  return current >= start || current <= end;
}

function modeDecorationsFromOverride(override: OrgCelebrationModeOverride, fallback: string[]): string[] {
  const d = [override.emoji_primary?.trim(), override.emoji_secondary?.trim()].filter(Boolean) as string[];
  return d.length ? d : fallback;
}

function toCustomWindow(override: OrgCelebrationModeOverride): ((now: Date) => boolean) | null {
  if (!hasCustomDateWindow(override)) return null;
  return (now: Date) =>
    isInMonthDayWindow(
      now,
      override.auto_start_month!,
      override.auto_start_day!,
      override.auto_end_month!,
      override.auto_end_day!
    );
}

/**
 * Merges org rows into built-in celebration defs. If an org row sets all four
 * `auto_*` fields, those dates drive `isActiveNow` (e.g. after Calendarific sync).
 * Otherwise built-in `MODE_DEFS.isActiveNow` remains the fallback until sync runs.
 */
function buildModeDefs(overrides: OrgCelebrationModeOverride[] = []): CelebrationModeDef[] {
  const byKey = new Map(overrides.map((o) => [o.mode_key, o]));
  const builtIns: CelebrationModeDef[] = MODE_DEFS.flatMap((base) => {
    const override = byKey.get(base.id);
    if (!override) return [base];
    if (!override.is_enabled && base.id !== 'off') return [];
    const customWindow = toCustomWindow(override);
    return [
      {
        ...base,
        label: override.label?.trim() || base.label,
        gradient: override.gradient_override?.trim() || base.gradient,
        decorations: modeDecorationsFromOverride(override, base.decorations),
        isActiveNow: customWindow ?? base.isActiveNow,
      },
    ];
  });

  const custom = overrides
    .filter((o) => o.mode_key.startsWith('org_custom:') && o.is_enabled)
    .map<CelebrationModeDef>((o) => {
      const customWindow = toCustomWindow(o);
      return {
        id: normalizeCelebrationMode(o.mode_key),
        label: o.label?.trim() || 'Custom mode',
        category: 'Organisation custom',
        gradient: o.gradient_override?.trim() || 'linear-gradient(180deg,#1f2937 0%,#374151 50%,#6b7280 100%)',
        decorations: modeDecorationsFromOverride(o, ['✨', '🎉']),
        isActiveNow: customWindow ?? (() => false),
      };
    });

  return [...builtIns, ...custom];
}

export function getCelebrationModeDef(
  mode: CelebrationMode,
  overrides: OrgCelebrationModeOverride[] = []
): CelebrationModeDef {
  const defs = buildModeDefs(overrides);
  return defs.find((m) => m.id === mode) ?? defs.find((m) => m.id === 'off') ?? MODE_DEFS[0]!;
}

export function getAutoCelebrationMode(
  now = new Date(),
  overrides: OrgCelebrationModeOverride[] = []
): CelebrationMode {
  const defs = buildModeDefs(overrides);
  const active = defs.find((m) => m.id !== 'off' && m.isActiveNow(now));
  return active?.id ?? 'off';
}

export function getCelebrationModeOptions(
  overrides: OrgCelebrationModeOverride[] = []
): Array<{ id: CelebrationMode; label: string; category: CelebrationModeCategory }> {
  return buildModeDefs(overrides).map((m) => ({
    id: m.id,
    label: m.label,
    category: m.category,
  }));
}
