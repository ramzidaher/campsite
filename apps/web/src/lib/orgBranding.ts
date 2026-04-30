import type { CelebrationMode } from '@/lib/holidayThemes';
import type { CSSProperties } from 'react';

export const ORG_BRAND_TOKEN_KEYS = [
  'bg',
  'surface',
  'text',
  'muted',
  'border',
  'primary',
  'secondary',
  'accent',
] as const;

export type OrgBrandTokenKey = (typeof ORG_BRAND_TOKEN_KEYS)[number];
export type OrgBrandTokens = Partial<Record<OrgBrandTokenKey, string>>;

export type OrgBrandPolicy =
  | 'celebration_overrides_brand'
  | 'brand_base_with_celebration_accents'
  | 'brand_overrides_celebration';

export type OrgBrandPresetKey = 'campfire' | 'ocean' | 'forest' | 'violet';

export const ORG_BRAND_POLICY_OPTIONS: Array<{ value: OrgBrandPolicy; label: string }> = [
  { value: 'celebration_overrides_brand', label: 'Celebration colors can override branding' },
  { value: 'brand_base_with_celebration_accents', label: 'Keep brand colors, celebration accents only' },
  { value: 'brand_overrides_celebration', label: 'Always preserve brand colors' },
];

export const ORG_BRAND_PRESETS: Record<OrgBrandPresetKey, Record<OrgBrandTokenKey, string>> = {
  campfire: {
    bg: '#faf9f6',
    surface: '#f5f4f1',
    text: '#121212',
    muted: '#6b6b6b',
    border: '#d8d8d8',
    primary: '#121212',
    secondary: '#4f4f4f',
    accent: '#121212',
  },
  ocean: {
    bg: '#f3f8fb',
    surface: '#e8f1f7',
    text: '#0f172a',
    muted: '#475569',
    border: '#cbd5e1',
    primary: '#0f4c81',
    secondary: '#0a7ea4',
    accent: '#0f4c81',
  },
  forest: {
    bg: '#f5f8f4',
    surface: '#eaf1e7',
    text: '#102218',
    muted: '#3b4d41',
    border: '#c7d6cb',
    primary: '#1f5b36',
    secondary: '#2d7a4a',
    accent: '#1f5b36',
  },
  violet: {
    bg: '#f8f6fc',
    surface: '#efeafb',
    text: '#1f1533',
    muted: '#5d4f78',
    border: '#d5cdec',
    primary: '#5b3ea8',
    secondary: '#7a5dd0',
    accent: '#5b3ea8',
  },
};

const FALLBACK_PRESET: OrgBrandPresetKey = 'campfire';

export type ResolvedOrgBranding = {
  presetKey: OrgBrandPresetKey;
  tokens: Record<OrgBrandTokenKey, string>;
  policy: OrgBrandPolicy;
  shouldApplyCelebrationGradient: boolean;
};

function normalizeHex(value: string): string | null {
  const t = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${Math.max(0, Math.min(255, Math.round(r)))
    .toString(16)
    .padStart(2, '0')}${Math.max(0, Math.min(255, Math.round(g)))
    .toString(16)
    .padStart(2, '0')}${Math.max(0, Math.min(255, Math.round(b)))
    .toString(16)
    .padStart(2, '0')}`;
}

function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t
  );
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const norm = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * norm[0]! + 0.7152 * norm[1]! + 0.0722 * norm[2]!;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export function onColorFor(bg: string): '#121212' | '#faf9f6' {
  return contrastRatio(bg, '#121212') >= contrastRatio(bg, '#faf9f6') ? '#121212' : '#faf9f6';
}

export type BrandAccessibilityIssue = {
  token: OrgBrandTokenKey;
  against: OrgBrandTokenKey;
  ratio: number;
  minimum: number;
};

export function getBrandAccessibilityIssues(
  tokens: Record<OrgBrandTokenKey, string>
): BrandAccessibilityIssue[] {
  const issues: BrandAccessibilityIssue[] = [];
  const checks: Array<{
    token: OrgBrandTokenKey;
    against: OrgBrandTokenKey;
    minimum: number;
  }> = [
    { token: 'text', against: 'bg', minimum: 4.5 },
    { token: 'muted', against: 'bg', minimum: 3 },
    { token: 'border', against: 'bg', minimum: 1.8 },
    { token: 'primary', against: 'bg', minimum: 2.8 },
    { token: 'secondary', against: 'bg', minimum: 2.8 },
    { token: 'accent', against: 'bg', minimum: 2.8 },
  ];
  for (const check of checks) {
    const ratio = contrastRatio(tokens[check.token], tokens[check.against]);
    if (ratio < check.minimum) {
      issues.push({ ...check, ratio });
    }
  }
  return issues;
}

export function enforceAccessibleBrandTokens(tokens: Record<OrgBrandTokenKey, string>): {
  tokens: Record<OrgBrandTokenKey, string>;
  adjusted: boolean;
} {
  let adjusted = false;
  const next: Record<OrgBrandTokenKey, string> = { ...tokens };

  const bestText = onColorFor(next.bg);
  if (contrastRatio(next.text, next.bg) < 4.5) {
    next.text = bestText;
    adjusted = true;
  }

  if (contrastRatio(next.muted, next.bg) < 3) {
    next.muted = mixHex(next.text, next.bg, next.text === '#121212' ? 0.45 : 0.35);
    adjusted = true;
  }

  if (contrastRatio(next.border, next.bg) < 1.8) {
    next.border = mixHex(next.text, next.bg, next.text === '#121212' ? 0.7 : 0.55);
    adjusted = true;
  }

  for (const key of ['primary', 'secondary', 'accent'] as const) {
    if (contrastRatio(next[key], next.bg) < 2.8) {
      next[key] = mixHex(next[key], next.text, 0.38);
      adjusted = true;
    }
  }

  return { tokens: next, adjusted };
}

export function sanitizeOrgBrandTokens(raw: unknown): OrgBrandTokens {
  if (!raw || typeof raw !== 'object') return {};
  const rec = raw as Record<string, unknown>;
  const out: OrgBrandTokens = {};
  for (const key of ORG_BRAND_TOKEN_KEYS) {
    const value = rec[key];
    if (typeof value !== 'string') continue;
    const normalized = normalizeHex(value);
    if (normalized) out[key] = normalized;
  }
  return out;
}

export function normalizeOrgBrandPolicy(raw: unknown): OrgBrandPolicy {
  if (
    raw === 'celebration_overrides_brand' ||
    raw === 'brand_base_with_celebration_accents' ||
    raw === 'brand_overrides_celebration'
  ) {
    return raw;
  }
  return 'brand_base_with_celebration_accents';
}

export function normalizeOrgBrandPreset(raw: unknown): OrgBrandPresetKey {
  if (raw === 'campfire' || raw === 'ocean' || raw === 'forest' || raw === 'violet') return raw;
  return FALLBACK_PRESET;
}

export function resolveOrgBranding(args: {
  presetKey: unknown;
  customTokens: unknown;
  policy: unknown;
  effectiveMode: CelebrationMode;
}): ResolvedOrgBranding {
  const presetKey = normalizeOrgBrandPreset(args.presetKey);
  const base = ORG_BRAND_PRESETS[presetKey];
  const custom = sanitizeOrgBrandTokens(args.customTokens);
  const policy = normalizeOrgBrandPolicy(args.policy);
  const enforced = enforceAccessibleBrandTokens({
    ...base,
    ...custom,
  });
  const shouldApplyCelebrationGradient =
    args.effectiveMode !== 'off' && policy !== 'brand_overrides_celebration';
  return {
    presetKey,
    tokens: enforced.tokens,
    policy,
    shouldApplyCelebrationGradient,
  };
}

export function orgBrandingCssVars(tokens: Record<OrgBrandTokenKey, string>): CSSProperties {
  return {
    ['--org-brand-bg' as string]: tokens.bg,
    ['--org-brand-surface' as string]: tokens.surface,
    ['--org-brand-text' as string]: tokens.text,
    ['--org-brand-muted' as string]: tokens.muted,
    ['--org-brand-border' as string]: tokens.border,
    ['--org-brand-primary' as string]: tokens.primary,
    ['--org-brand-secondary' as string]: tokens.secondary,
    ['--org-brand-accent' as string]: tokens.accent,
    ['--org-brand-on-primary' as string]: onColorFor(tokens.primary),
  };
}

export function suggestedBrandTokensFromHexes(hexes: string[]): OrgBrandTokens {
  const clean = hexes.map((h) => normalizeHex(h)).filter(Boolean) as string[];
  if (clean.length === 0) return {};
  const primary = clean[0];
  const secondary = clean[1] ?? primary;
  const accent = clean[2] ?? secondary;
  return { primary, secondary, accent };
}
