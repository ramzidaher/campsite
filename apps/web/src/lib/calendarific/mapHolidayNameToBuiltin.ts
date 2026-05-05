import type { BuiltInCelebrationMode } from '@/lib/holidayThemes';

type MatchRule = {
  mode: BuiltInCelebrationMode;
  test: (normalized: string) => boolean;
};

/**
 * Ordered rules: more specific patterns must precede generic ones (e.g. Good Friday before Easter).
 */
const RULES: MatchRule[] = [
  { mode: 'good_friday', test: (n) => /\bgood friday\b/i.test(n) },
  { mode: 'palm_sunday', test: (n) => /\bpalm sunday\b/i.test(n) },
  { mode: 'easter', test: (n) => /\beaster sunday\b/i.test(n) || /^easter$/i.test(n.trim()) },
  { mode: 'boxing_day', test: (n) => /\bboxing day\b/i.test(n) },
  { mode: 'new_years_day', test: (n) => /\bnew year'?s day\b/i.test(n) || /\bnew year day\b/i.test(n) },
  { mode: 'valentines_day', test: (n) => /\bvalentine'?s day\b/i.test(n) },
  {
    mode: 'international_womens_day',
    test: (n) => /\binternational women'?s day\b/i.test(n) || /\bwomen'?s day\b/i.test(n),
  },
  { mode: 'earth_day', test: (n) => /\bearth day\b/i.test(n) },
  { mode: 'christmas', test: (n) => /\bchristmas day\b/i.test(n) || /^christmas$/i.test(n.trim()) },
  { mode: 'christmas', test: (n) => /\bchristmas\b/i.test(n) && !/\bchristmas eve\b/i.test(n) },
  { mode: 'hanukkah', test: (n) => /\bhanukkah\b/i.test(n) || /\bchanukah\b/i.test(n) },
  { mode: 'passover', test: (n) => /\bpassover\b/i.test(n) || /\bpesach\b/i.test(n) },
  { mode: 'rosh_hashanah', test: (n) => /\brosh hashanah\b/i.test(n) },
  { mode: 'yom_kippur', test: (n) => /\byom kippur\b/i.test(n) },
  { mode: 'eid_al_fitr', test: (n) => /\beid al[\s-]?fitr\b/i.test(n) || /\beid ul[\s-]?fitr\b/i.test(n) },
  { mode: 'eid_al_adha', test: (n) => /\beid al[\s-]?adha\b/i.test(n) || /\beid ul[\s-]?adha\b/i.test(n) },
  {
    mode: 'ramadan',
    test: (n) =>
      /\bstart of ramadan\b/i.test(n) ||
      /\bramadan begins\b/i.test(n) ||
      /^ramadan$/i.test(n.trim()),
  },
  { mode: 'diwali', test: (n) => /\bdiwali\b/i.test(n) },
  { mode: 'holi', test: (n) => /\bholi\b/i.test(n) && !/\bhollywood\b/i.test(n) },
  {
    mode: 'lunar_new_year',
    test: (n) => /\bchinese new year\b/i.test(n) || /\blunar new year\b/i.test(n),
  },
  { mode: 'vesak', test: (n) => /\bvesak\b/i.test(n) || /\bbuddha'?s birthday\b/i.test(n) },
  { mode: 'halloween', test: (n) => /\bhalloween\b/i.test(n) },
  { mode: 'thanksgiving', test: (n) => /\bthanksgiving\b/i.test(n) },
  { mode: 'black_friday', test: (n) => /\bblack friday\b/i.test(n) },
  {
    mode: 'mothers_day',
    test: (n) =>
      /\bmother'?s day\b/i.test(n) ||
      /\bmothering sunday\b/i.test(n) ||
      /\bmothers' day\b/i.test(n),
  },
  { mode: 'fathers_day', test: (n) => /\bfather'?s day\b/i.test(n) },
  {
    mode: 'early_may_bank_holiday',
    test: (n) =>
      /\bearly may bank holiday\b/i.test(n) ||
      /\bearly may bank\b/i.test(n) ||
      /\bmay day bank holiday\b/i.test(n),
  },
  { mode: 'bonfire_night', test: (n) => /\bguy fawkes\b/i.test(n) || /\bbonfire night\b/i.test(n) },
];

export function mapHolidayNameToBuiltin(name: string): BuiltInCelebrationMode | null {
  const normalized = name.trim();
  if (!normalized) return null;
  for (const rule of RULES) {
    if (rule.test(normalized)) return rule.mode;
  }
  return null;
}
