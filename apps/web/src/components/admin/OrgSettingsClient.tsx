'use client';

import { createClient } from '@/lib/supabase/client';
import { CELEBRATION_MODE_OPTIONS, getCelebrationModeAdminDefaults } from '@/lib/holidayThemes';
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
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
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
  const cropDragStartRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null);
  const [notif, setNotif] = useState(initial.default_notifications_enabled);
  const [timezone, setTimezone] = useState(initial.timezone ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [celebrationModes, setCelebrationModes] = useState<OrgCelebrationMode[]>(initialCelebrationModes);
  const [newModeKey, setNewModeKey] = useState('');
  const [newModeLabel, setNewModeLabel] = useState('');
  const [brandPresetKey, setBrandPresetKey] = useState(initial.brand_preset_key ?? 'campfire');
  const [brandPolicy, setBrandPolicy] = useState(initial.brand_policy ?? 'brand_base_with_celebration_accents');
  const [brandTokens, setBrandTokens] = useState<Record<OrgBrandTokenKey, string>>(() => {
    const incoming = (initial.brand_tokens ?? {}) as Record<string, string>;
    const base = ORG_BRAND_PRESETS.campfire;
    const next: Record<OrgBrandTokenKey, string> = { ...base };
    for (const key of ORG_BRAND_TOKEN_KEYS) {
      const value = incoming[key];
      if (typeof value === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(value.trim())) next[key] = value.trim();
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
        if (typeof value === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(value.trim())) next[key] = value.trim();
      }
      return next;
    });
  }, [initial]);
  useEffect(() => {
    setCelebrationModes(initialCelebrationModes);
  }, [initialCelebrationModes]);

  const builtInModes = useMemo(
    () => CELEBRATION_MODE_OPTIONS.filter((m) => m.id !== 'off'),
    []
  );

  function flash(message: string, tone: 'ok' | 'err') {
    setMsg(message);
    setMsgTone(tone);
  }

  async function persistBrandingPatch(patch: Record<string, unknown>) {
    const { error } = await supabase.from('organisations').update(patch).eq('id', initial.id);
    if (error) throw new Error(error.message);
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
          auto_start_month: null,
          auto_start_day: null,
          auto_end_month: null,
          auto_end_day: null,
          gradient_override: null,
          emoji_primary: null,
          emoji_secondary: null,
          [key]: value,
        },
      ];
    });
  }

  async function saveCelebrations() {
    setLoading(true);
    setMsg(null);
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
    flash('Custom mode removed.', 'ok');
    router.refresh();
  }

  function addCustomModeDraft() {
    const keyPart = newModeKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
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
        gradient_override: null,
        emoji_primary: '✨',
        emoji_secondary: '🎉',
      },
    ]);
    setNewModeKey('');
    setNewModeLabel('');
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

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Organisation settings
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Configure your organisation&apos;s branding and general settings
        </p>
      </div>

      <div className="grid max-w-[860px] gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
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

        <div>
          {tab === 'branding' ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">Branding</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">Customise how your organisation appears in Campsite.</p>

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
                    Use a <strong className="font-medium text-[#6b6b6b]">direct image URL</strong> (PNG, SVG, JPG, or
                    WebP) - not a website homepage. The link should usually end in{' '}
                    <span className="font-mono">.png</span>, <span className="font-mono">.svg</span>, etc.
                  </p>
                  {trimmedLogoUrl && logoPreviewFailed ? (
                    <p className="mt-2 text-[11.5px] font-medium text-[#b45309]">
                      We couldn&apos;t load an image from this URL. Try opening it in a new tab - if you see a page
                      instead of a picture, paste the image file&apos;s address instead.
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
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">Organisation name</span>
                <input
                  className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13.5px] text-[#121212] outline-none focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-[#6b6b6b]">Subdomain</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-2.5 font-mono text-[13px] text-[#121212]"
                    value={initial.slug}
                  />
                  <span className="shrink-0 text-[13px] text-[#9b9b9b]">.camp-site.co.uk</span>
                </div>
                <span className="mt-1 block text-[11.5px] text-[#9b9b9b]">
                  Slug is set when the organisation is created; contact support to change invite links.
                </span>
              </label>

              <div className="mt-4 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
                <div className="text-[12.5px] font-medium text-[#121212]">Find from website domain</div>
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
                    <select
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-2 text-[12px] text-[#121212]"
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
                    </select>
                  </label>
                  <label className="text-[11.5px] text-[#6b6b6b]">
                    Celebration + brand policy
                    <select
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-2 text-[12px] text-[#121212]"
                      value={brandPolicy}
                      onChange={(e) => setBrandPolicy(e.target.value)}
                    >
                      {ORG_BRAND_POLICY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
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
                      Some color pairs have low contrast and may be hard to read. Saving will auto-adjust them.
                    </p>
                    <ul className="mt-2 space-y-1 text-[11.5px] text-[#7c2d12]">
                      {brandAccessibilityIssues.map((issue) => (
                        <li key={`${issue.token}-${issue.against}`}>
                          `{issue.token}` vs `{issue.against}` contrast {issue.ratio.toFixed(2)} (needs at least{' '}
                          {issue.minimum.toFixed(1)})
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
              <p className="mt-1 text-[13px] text-[#6b6b6b]">System-wide defaults for your organisation.</p>

              <div className="mt-2 border-t border-[#d8d8d8]">
                <label className="block border-b border-[#d8d8d8] py-4">
                  <span className="text-[13.5px] font-medium text-[#121212]">Default timezone (rota &amp; calendar)</span>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                    IANA name (e.g. <span className="font-mono">Europe/London</span>). Leave empty to use each
                    viewer&apos;s device time. Used when displaying shift times on web and mobile.
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
                    <div className="text-[13.5px] font-medium text-[#121212]">Default in-app notifications</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b9b9b]">
                      New members start with notifications enabled for broadcasts and updates unless they change this in
                      their profile.
                    </p>
                  </div>
                  <Toggle on={notif} onToggle={() => setNotif((v) => !v)} disabled={loading} />
                </div>
              </div>

              <p className="mt-4 text-[12px] leading-relaxed text-[#9b9b9b]">
                Member approvals, broadcast approval queues, and role capabilities are enforced by permissions today  - 
                additional organisation policy toggles may appear here later.
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
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <div className="font-authSerif text-[17px] text-[#121212]">Celebration modes</div>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                Override auto-date windows, emoji, and gradients for built-in holidays, or create custom organisation
                modes.
              </p>

              <div className="mt-4 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-3">
                <div className="text-[12.5px] font-medium text-[#121212]">Create custom mode</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]"
                    placeholder="Key (e.g. founders_day)"
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
                  className="mt-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#faf9f6]"
                >
                  Add custom mode
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {[...builtInModes, ...celebrationModes.filter((m) => m.mode_key.startsWith('org_custom:')).map((m) => ({ id: m.mode_key, label: m.label }))].map((mode, idx) => {
                  const row = celebrationModes.find((m) => m.mode_key === mode.id) ?? {
                    id: `base-${mode.id}`,
                    mode_key: mode.id,
                    label: mode.label,
                    is_enabled: true,
                    display_order: idx + 1,
                    ...getCelebrationModeAdminDefaults(mode.id as Parameters<typeof getCelebrationModeAdminDefaults>[0]),
                  };
                  const isCustom = row.mode_key.startsWith('org_custom:');
                  return (
                    <div key={row.mode_key} className="rounded-lg border border-[#d8d8d8] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[#121212]">{row.label}</div>
                          <div className="text-[11px] text-[#9b9b9b]">{row.mode_key}</div>
                        </div>
                        <Toggle
                          on={row.is_enabled}
                          onToggle={() => setModeField(row.mode_key, 'is_enabled', !row.is_enabled, row.label, idx + 1)}
                        />
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12px] text-[#121212] outline-none focus:border-[#121212]"
                          value={row.label}
                          onChange={(e) => setModeField(row.mode_key, 'label', e.target.value, row.label, idx + 1)}
                          placeholder="Label"
                        />
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12px] text-[#121212] outline-none focus:border-[#121212]"
                          value={row.gradient_override ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'gradient_override', e.target.value || null, row.label, idx + 1)}
                          placeholder="Gradient CSS override"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-1.5 text-[12px]"
                          value={row.auto_start_month ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'auto_start_month', e.target.value ? Number(e.target.value) : null, row.label, idx + 1)}
                          placeholder="Start month"
                        />
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-1.5 text-[12px]"
                          value={row.auto_start_day ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'auto_start_day', e.target.value ? Number(e.target.value) : null, row.label, idx + 1)}
                          placeholder="Start day"
                        />
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-1.5 text-[12px]"
                          value={row.auto_end_month ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'auto_end_month', e.target.value ? Number(e.target.value) : null, row.label, idx + 1)}
                          placeholder="End month"
                        />
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-2 py-1.5 text-[12px]"
                          value={row.auto_end_day ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'auto_end_day', e.target.value ? Number(e.target.value) : null, row.label, idx + 1)}
                          placeholder="End day"
                        />
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12px]"
                          value={row.emoji_primary ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'emoji_primary', e.target.value || null, row.label, idx + 1)}
                          placeholder="Emoji primary"
                        />
                        <input
                          className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[12px]"
                          value={row.emoji_secondary ?? ''}
                          onChange={(e) => setModeField(row.mode_key, 'emoji_secondary', e.target.value || null, row.label, idx + 1)}
                          placeholder="Emoji secondary"
                        />
                      </div>
                      {isCustom ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => void removeMode(row.mode_key)}
                            className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1.5 text-[12px] font-medium text-[#b91c1c] hover:bg-[#fee2e2]"
                          >
                            Remove custom mode
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => void saveCelebrations()}
                className="mt-4 rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save celebrations
              </button>
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
                    <div className="text-[13.5px] font-medium text-[#121212]">Export all member data</div>
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
                    <div className="text-[13.5px] font-medium text-[#121212]">Request deactivation</div>
                    <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
                      Records a request to wind down the org. Common Ground Studios follows up off-platform; data is not
                      immediately deleted.
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
                <p className="text-[11px] text-[#9b9b9b]">Tip: keep key details near the center crosshair.</p>
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
        <p className={`mt-4 text-[13px] ${msgTone === 'err' ? 'text-[#b91c1c]' : 'text-[#15803d]'}`}>{msg}</p>
      ) : null}
    </div>
  );
}
