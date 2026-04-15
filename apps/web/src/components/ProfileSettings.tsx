'use client';

import { accentPresets, type AccentPreset } from '@campsite/theme';
import {
  settingsBroadcastChannelsHelp,
  settingsBroadcastChannelsTitle,
} from '@/lib/broadcasts/channelCopy';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import { createClient } from '@/lib/supabase/client';
import { useCampfireAmbientPreferences } from '@/lib/sound/useCampfireAmbientPreferences';
import { useUiSound, useUiSoundPreferences } from '@/lib/sound/useUiSound';
import {
  CELEBRATION_MODE_OPTIONS,
  normalizeCelebrationMode,
  type CelebrationModeCategory,
  type CelebrationMode,
} from '@/lib/holidayThemes';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  applyAccessibilityPreferencesToDocument,
  loadAccessibilityPreferences,
  saveAccessibilityPreferences,
  type AccessibilityPreferences,
  type AccessibilityTextSize,
} from '@/lib/accessibilityPreferences';

type Profile = {
  full_name: string;
  avatar_url: string | null;
  role: string;
  accent_preset: string;
  color_scheme: string;
  celebration_mode?: CelebrationMode | null;
  celebration_auto_enabled?: boolean | null;
  dnd_enabled: boolean;
  dnd_start: string | null;
  dnd_end: string | null;
  shift_reminder_before_minutes: number | null;
  rota_open_slot_alerts_enabled: boolean;
};

type Tab =
  | 'profile'
  | 'appearance'
  | 'accessibility'
  | 'notifications'
  | 'channels'
  | 'integrations'
  | 'security'
  | 'account';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: 'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z' },
  { id: 'appearance', label: 'Appearance', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { id: 'accessibility', label: 'Accessibility', icon: 'M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 5h-4.5v15h-3V15h-1v7h-3V7H2V4h16v3z' },
  { id: 'notifications', label: 'Notifications', icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  { id: 'channels', label: 'Channels', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z' },
  { id: 'integrations', label: 'Integrations', icon: 'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z' },
  { id: 'security', label: 'Security', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z' },
  { id: 'account', label: 'Account', icon: 'M10.25 2.45L9 3.7 10.6 5.3C9.61 6.23 9 7.54 9 9c0 2.76 2.24 5 5 5s5-2.24 5-5-2.24-5-5-5c-.53 0-1.04.08-1.52.23L11.15 2.9l-.9-.45zM14 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zM3 5v2h6.06c.28.73.74 1.37 1.32 1.87L9.26 10H3v2h5.06L5.5 14.5 7 16l3.5-3.5h.5c2.76 0 5-2.24 5-5 0-.34-.04-.67-.1-1H17V5H3z' },
];

function profileRoleDisplay(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'Org admin',
    super_admin: 'Org admin',
    manager: 'Manager',
    coordinator: 'Coordinator',
    administrator: 'Administrator',
    duty_manager: 'Duty manager',
    csa: 'CSA',
    society_leader: 'Society leader',
    unassigned: 'Pending role',
  };
  return m[role] ?? role.replace(/_/g, ' ');
}

function accentLabel(key: AccentPreset): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function safeHttpImageUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return t;
  } catch {
    return null;
  }
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; width: string };

function getPasswordStrength(pwd: string): PasswordStrength {
  if (!pwd) return { score: 0, label: '', color: '', width: '0%' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const labels: Record<number, string> = { 0: '', 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
  const colors: Record<number, string> = { 0: '', 1: 'bg-red-400', 2: 'bg-orange-400', 3: 'bg-yellow-400', 4: 'bg-emerald-500' };
  const widths: Record<number, string> = { 0: '0%', 1: '25%', 2: '50%', 3: '75%', 4: '100%' };
  return { score: s, label: labels[s]!, color: colors[s]!, width: widths[s]! };
}

const fieldLabel = 'block text-[13px] font-medium text-[#121212]';
const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] shadow-sm outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-1 focus:ring-[#121212]';
const selectClass = inputClass;
const sectionTitle = 'mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]';
const sectionDesc = 'mb-5 text-[13px] text-[#6b6b6b]';
const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a] disabled:pointer-events-none disabled:opacity-45';
const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-[13px] font-medium text-[#121212] transition hover:bg-[#f5f4f1] disabled:pointer-events-none disabled:opacity-45';
const btnDanger =
  'inline-flex items-center justify-center rounded-lg border border-[#b91c1c]/35 bg-[#b91c1c] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#991b1b] disabled:pointer-events-none disabled:opacity-45';
const SHELL_MODE_STORAGE_KEY = 'campsite_shell_mode';
const SHELL_MODE_AUTO_STORAGE_KEY = 'campsite_shell_mode_auto_enabled';
const LEGACY_PRIDE_MODE_STORAGE_KEY = 'campsite_pride_mode';

export type BroadcastChannelPref = {
  channel_id: string;
  name: string;
  dept_id: string;
  dept_name: string;
  subscribed: boolean;
};

export function ProfileSettings({
  initial,
  googleFlash,
  googleFlashTone,
  tenantOrgs,
  currentOrgId,
  initialBroadcastChannels = [],
  canManageDiscounts = false,
  celebrationModeOptions = CELEBRATION_MODE_OPTIONS,
}: {
  initial: Profile | null;
  googleFlash?: string | null;
  googleFlashTone?: 'success' | 'error' | null;
  tenantOrgs?: LoginOrgOption[] | null;
  currentOrgId?: string | null;
  initialBroadcastChannels?: BroadcastChannelPref[];
  canManageDiscounts?: boolean;
  celebrationModeOptions?: Array<{
    id: CelebrationMode;
    label: string;
    category: CelebrationModeCategory;
  }>;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Sync tab from URL hash after mount (client-only)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Tab;
    if (TABS.some((t) => t.id === hash)) setActiveTab(hash);
  }, []);

  const [profile, setProfile] = useState<Profile | null>(initial);
  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatar_url ?? '');
  const [accent, setAccent] = useState<string>(initial?.accent_preset ?? 'midnight');
  const [scheme, setScheme] = useState<string>(initial?.color_scheme ?? 'system');
  const [dnd, setDnd] = useState(initial?.dnd_enabled ?? false);
  const [dndStart, setDndStart] = useState(initial?.dnd_start ?? '22:00');
  const [dndEnd, setDndEnd] = useState(initial?.dnd_end ?? '07:00');
  const [shiftReminder, setShiftReminder] = useState<number | 'off'>(() => {
    const m = initial?.shift_reminder_before_minutes;
    if (m == null) return 'off';
    return m;
  });
  const [openSlotAlertsEnabled, setOpenSlotAlertsEnabled] = useState(
    initial?.rota_open_slot_alerts_enabled ?? false
  );

  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordsMatch = confirmPassword === '' || password === confirmPassword;
  const passwordValid = password.length >= 8 && password === confirmPassword && confirmPassword !== '';

  const [msg, setMsg] = useState<string | null>(googleFlash ?? null);
  const [msgTone, setMsgTone] = useState<'success' | 'error' | 'neutral'>(() => {
    if (googleFlashTone === 'success') return 'success';
    if (googleFlashTone === 'error') return 'error';
    return 'neutral';
  });
  const [loading, setLoading] = useState(false);
  const [shellMode, setShellMode] = useState<CelebrationMode>(normalizeCelebrationMode(initial?.celebration_mode));
  const [shellModeAutoEnabled, setShellModeAutoEnabled] = useState<boolean>(
    initial?.celebration_auto_enabled ?? true
  );
  const [tenantSwitching, setTenantSwitching] = useState<string | null>(null);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [channelPrefs, setChannelPrefs] = useState<BroadcastChannelPref[]>(initialBroadcastChannels);
  const [channelBusyId, setChannelBusyId] = useState<string | null>(null);
  const [a11yPrefs, setA11yPrefs] = useState<AccessibilityPreferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const { prefs: uiSoundPrefs, setEnabled: setUiSoundEnabled, setVolume: setUiSoundVolume } =
    useUiSoundPreferences();
  const {
    prefs: campfirePrefs,
    setEnabled: setCampfireEnabled,
    setVolume: setCampfireVolume,
  } = useCampfireAmbientPreferences();
  const playUiSound = useUiSound();

  const safeAvatar = useMemo(() => safeHttpImageUrl(avatarUrl), [avatarUrl]);

  useEffect(() => { setAvatarPreviewFailed(false); }, [safeAvatar]);

  useEffect(() => {
    setProfile(initial);
    const m = initial?.shift_reminder_before_minutes;
    setShiftReminder(m == null ? 'off' : m);
    setOpenSlotAlertsEnabled(initial?.rota_open_slot_alerts_enabled ?? false);
    setShellMode(normalizeCelebrationMode(initial?.celebration_mode));
    setShellModeAutoEnabled(initial?.celebration_auto_enabled ?? true);
  }, [initial]);

  useEffect(() => { setChannelPrefs(initialBroadcastChannels); }, [initialBroadcastChannels]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SHELL_MODE_STORAGE_KEY);
      const savedAuto = window.localStorage.getItem(SHELL_MODE_AUTO_STORAGE_KEY);
      const legacyPride = window.localStorage.getItem(LEGACY_PRIDE_MODE_STORAGE_KEY) === '1';
      if (saved) {
        setShellMode(normalizeCelebrationMode(saved));
      } else if (legacyPride) {
        setShellMode('pride');
      } else {
        setShellMode(normalizeCelebrationMode(initial?.celebration_mode));
      }
      if (savedAuto === '0') setShellModeAutoEnabled(false);
      else if (savedAuto === '1') setShellModeAutoEnabled(true);
      else setShellModeAutoEnabled(initial?.celebration_auto_enabled ?? true);
    } catch {
      setShellMode(normalizeCelebrationMode(initial?.celebration_mode));
      setShellModeAutoEnabled(initial?.celebration_auto_enabled ?? true);
    }
  }, [initial?.celebration_mode, initial?.celebration_auto_enabled]);

  useEffect(() => {
    setMsg(googleFlash ?? null);
    if (googleFlashTone === 'success') setMsgTone('success');
    else if (googleFlashTone === 'error') setMsgTone('error');
    else if (googleFlash != null) setMsgTone('neutral');
    // If there's a Google flash, navigate to integrations tab
    if (googleFlash != null) setActiveTab('integrations');
  }, [googleFlash, googleFlashTone]);

  useEffect(() => {
    const prefs = loadAccessibilityPreferences();
    setA11yPrefs(prefs);
    applyAccessibilityPreferencesToDocument(prefs);
  }, []);

  const navigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setMsg(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  }, []);

  function setFeedback(text: string, tone: 'success' | 'error' | 'neutral') {
    setMsg(text);
    setMsgTone(tone);
  }

  function setShellModePref(mode: CelebrationMode) {
    setShellMode(mode);
    const nextAutoEnabled = mode === 'off' ? false : shellModeAutoEnabled;
    if (mode === 'off') {
      setShellModeAutoEnabled(false);
    }
    try {
      window.localStorage.setItem(SHELL_MODE_STORAGE_KEY, mode);
      window.localStorage.setItem(SHELL_MODE_AUTO_STORAGE_KEY, nextAutoEnabled ? '1' : '0');
      window.localStorage.setItem(LEGACY_PRIDE_MODE_STORAGE_KEY, mode === 'pride' ? '1' : '0');
    } catch {
      // ignore storage errors and still update current session
    }
    window.dispatchEvent(
      new CustomEvent('campsite:shell-mode-change', { detail: { mode, autoEnabled: nextAutoEnabled } })
    );
  }

  const channelsByDept = useMemo(() => {
    const m = new Map<string, BroadcastChannelPref[]>();
    for (const c of channelPrefs) {
      const list = m.get(c.dept_name) ?? [];
      list.push(c);
      m.set(c.dept_name, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [channelPrefs]);

  function setAccessibilityPref<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) {
    setA11yPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveAccessibilityPreferences(next);
      applyAccessibilityPreferencesToDocument(next);
      return next;
    });
  }

  function resetAccessibilityPrefs() {
    setA11yPrefs(DEFAULT_ACCESSIBILITY_PREFERENCES);
    saveAccessibilityPreferences(DEFAULT_ACCESSIBILITY_PREFERENCES);
    applyAccessibilityPreferencesToDocument(DEFAULT_ACCESSIBILITY_PREFERENCES);
  }

  async function toggleBroadcastChannel(channelId: string, next: boolean) {
    const snapshot = channelPrefs;
    setChannelPrefs((p) => p.map((c) => (c.channel_id === channelId ? { ...c, subscribed: next } : c)));
    setChannelBusyId(channelId);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setChannelPrefs(snapshot); setChannelBusyId(null); return; }
    const { error } = await supabase.from('user_subscriptions').upsert(
      { user_id: u.user.id, channel_id: channelId, subscribed: next },
      { onConflict: 'user_id,channel_id' }
    );
    setChannelBusyId(null);
    if (error) { setChannelPrefs(snapshot); setFeedback(error.message, 'error'); }
  }

  async function saveProfile() {
    setLoading(true);
    setMsg(null);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        avatar_url: avatarUrl || null,
        accent_preset: accent,
        color_scheme: scheme,
        celebration_mode: shellMode,
        celebration_auto_enabled: shellModeAutoEnabled,
        dnd_enabled: dnd,
        dnd_start: dnd ? dndStart : null,
        dnd_end: dnd ? dndEnd : null,
        shift_reminder_before_minutes: shiftReminder === 'off' ? null : shiftReminder,
        rota_open_slot_alerts_enabled: openSlotAlertsEnabled,
      })
      .eq('id', u.user.id);
    setLoading(false);
    if (error) { setFeedback(error.message, 'error'); return; }
    setFeedback('Saved.', 'success');
    router.refresh();
  }

  async function changePassword() {
    if (!passwordValid) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setFeedback(error.message, 'error'); return; }
    setPassword('');
    setConfirmPassword('');
    setFeedback('Password updated successfully.', 'success');
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  async function switchTenant(orgId: string) {
    setTenantSwitching(orgId);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc('set_my_active_org', { p_org_id: orgId });
    setTenantSwitching(null);
    if (error) { setFeedback(error.message, 'error'); return; }
    setFeedback('Switched workspace.', 'success');
    router.refresh();
  }

  async function deactivate() {
    if (!confirm('Deactivate your account? You can ask an admin to restore access.')) return;
    setLoading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', u.user.id);
    setLoading(false);
    if (error) { setFeedback(error.message, 'error'); return; }
    await supabase.auth.signOut();
    router.replace('/login');
  }

  const flashClass =
    msgTone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : msgTone === 'error'
        ? 'border-red-200 bg-red-50 text-red-950'
        : 'border-[#d8d8d8] bg-[#f5f4f1] text-[#121212]';

  if (!profile) {
    return (
      <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <p className="text-[13px] text-[#6b6b6b]">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 sm:flex-row sm:gap-7">
      {/* Sidebar nav */}
      <nav className="mb-4 sm:mb-0 sm:w-44 sm:shrink-0" aria-label="Settings sections">
        {/* Mobile: horizontal scrollable pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => navigate(t.id)}
              aria-pressed={activeTab === t.id}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                activeTab === t.id
                  ? 'bg-[#121212] text-white'
                  : 'bg-[#f5f4f1] text-[#6b6b6b] hover:bg-[#ece9e4] hover:text-[#121212]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Desktop: vertical list */}
        <ul className="hidden space-y-0.5 sm:block">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => navigate(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
                  activeTab === t.id
                    ? 'bg-[#121212] text-white'
                    : 'text-[#6b6b6b] hover:bg-[#f5f4f1] hover:text-[#121212]'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-current" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {msg ? (
          <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-[13px] ${flashClass}`}>
            {msg}
          </div>
        ) : null}

        {/* Profile tab */}
        {activeTab === 'profile' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>Profile</h2>
            <p className={sectionDesc}>Your public name, avatar, and role within the organisation.</p>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="flex shrink-0 justify-center sm:justify-start">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#d8d8d8] bg-[#faf9f6] text-[22px] font-semibold text-[#6b6b6b] shadow-sm">
                  {safeAvatar && !avatarPreviewFailed ? (
                    <img
                      src={safeAvatar}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarPreviewFailed(true)}
                    />
                  ) : (
                    <span aria-hidden>{initials(fullName || 'Member')}</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <label className={fieldLabel}>
                  Full name
                  <input
                    className={inputClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className={fieldLabel}>
                  Avatar URL
                  <input
                    className={inputClass}
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
                <div className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5">
                  <p className="text-[12.5px] leading-relaxed text-[#6b6b6b]">
                    <span className="font-medium text-[#121212]">{profileRoleDisplay(profile.role)}</span>
                    <span className="text-[#9b9b9b]"> · </span>
                    Contact an admin if you need a different role or team.
                  </p>
                </div>
                <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnPrimary}>
                  {loading ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appearance tab */}
        {activeTab === 'appearance' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>Appearance</h2>
            <p className={sectionDesc}>Colour scheme and accent colour for your interface.</p>
            <div className="space-y-4">
              <label className={fieldLabel}>
                Colour scheme
                <select className={selectClass} value={scheme} onChange={(e) => setScheme(e.target.value)}>
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <div>
                <p className={fieldLabel}>Accent</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.keys(accentPresets) as AccentPreset[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAccent(k)}
                      className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
                        accent === k
                          ? 'border-[#121212] bg-[#121212] text-white'
                          : 'border-[#d8d8d8] bg-[#faf9f6] text-[#6b6b6b] hover:border-[#c4c4c4] hover:text-[#121212]'
                      }`}
                    >
                      {accentLabel(k)}
                    </button>
                  ))}
                </div>
              </div>
              <label className={fieldLabel}>
                Celebration mode
                <select
                  className={selectClass}
                  value={shellMode}
                  onChange={(e) => setShellModePref(normalizeCelebrationMode(e.target.value))}
                >
                  {Array.from(new Set(celebrationModeOptions.map((o) => o.category))).map((category) => (
                    <optgroup key={category} label={category}>
                      {celebrationModeOptions.filter((o) => o.category === category).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <span className="mt-2 block text-[12.5px] font-normal text-[#6b6b6b]">
                  Adds a themed color wash to the sidebar and app shell.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={shellModeAutoEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setShellModeAutoEnabled(next);
                    try {
                      window.localStorage.setItem(SHELL_MODE_AUTO_STORAGE_KEY, next ? '1' : '0');
                    } catch {
                      // ignore storage errors
                    }
                    window.dispatchEvent(
                      new CustomEvent('campsite:shell-mode-change', {
                        detail: { mode: shellMode, autoEnabled: next },
                      })
                    );
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Auto holiday mode by date</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Automatically apply the current holiday theme when available. Manual selection still overrides.
                  </span>
                </span>
              </label>
              <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnPrimary}>
                {loading ? 'Saving…' : 'Save appearance'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>Accessibility</h2>
            <p className={sectionDesc}>
              Adjust visual and motion settings to match your needs. Changes apply instantly across the app.
            </p>
            <div className="space-y-4">
              <label className={fieldLabel}>
                Text size
                <select
                  className={selectClass}
                  value={a11yPrefs.largerText}
                  onChange={(e) =>
                    setAccessibilityPref('largerText', e.target.value as AccessibilityTextSize)
                  }
                >
                  <option value="default">Default</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.boldText}
                  onChange={(e) => setAccessibilityPref('boldText', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Bold text</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Increases text weight throughout the interface.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.increaseContrast}
                  onChange={(e) => setAccessibilityPref('increaseContrast', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Increase contrast</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Strengthens foreground/background separation.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.reduceTransparency}
                  onChange={(e) => setAccessibilityPref('reduceTransparency', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Reduce transparency</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Uses more opaque surfaces for overlays and translucent UI.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.reduceMotion}
                  onChange={(e) => setAccessibilityPref('reduceMotion', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Reduce motion</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Minimises animations and transition effects.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.dimFlashingLights}
                  onChange={(e) => setAccessibilityPref('dimFlashingLights', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Dim flashing lights (video)</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Lowers brightness of video playback to reduce visual strain.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.differentiateWithoutColor}
                  onChange={(e) => setAccessibilityPref('differentiateWithoutColor', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Differentiate without colour</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Adds non-colour visual cues where possible.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.buttonShapes}
                  onChange={(e) => setAccessibilityPref('buttonShapes', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Button shapes</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Emphasises tappable controls with underlined action text.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.onOffLabels}
                  onChange={(e) => setAccessibilityPref('onOffLabels', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">On/Off labels</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Adds explicit state labels in settings style controls.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.grayscale}
                  onChange={(e) => setAccessibilityPref('grayscale', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Greyscale filter</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Displays the interface in greyscale to reduce colour load.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={a11yPrefs.preferNonBlinkingCursor}
                  onChange={(e) => setAccessibilityPref('preferNonBlinkingCursor', e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Prefer non-blinking cursor</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Reduces caret flicker in text entry fields.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnSecondary} onClick={() => resetAccessibilityPrefs()}>
                  Reset accessibility defaults
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications tab */}
        {activeTab === 'notifications' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>Notifications</h2>
            <p className={sectionDesc}>Control when and how you receive alerts, sounds, and reminders.</p>
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={dnd}
                  onChange={(e) => setDnd(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Do Not Disturb</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    Quiet hours for reminders (times in your local timezone).
                  </span>
                </span>
              </label>
              {dnd ? (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <input
                    type="time"
                    className={`${inputClass} mt-0 w-auto min-w-[8.5rem] flex-1 sm:flex-none`}
                    value={dndStart}
                    onChange={(e) => setDndStart(e.target.value)}
                  />
                  <span className="text-[13px] text-[#9b9b9b]">to</span>
                  <input
                    type="time"
                    className={`${inputClass} mt-0 w-auto min-w-[8.5rem] flex-1 sm:flex-none`}
                    value={dndEnd}
                    onChange={(e) => setDndEnd(e.target.value)}
                  />
                </div>
              ) : null}
              <label className={fieldLabel}>
                Shift reminder (before start)
                <select
                  className={selectClass}
                  value={shiftReminder === 'off' ? 'off' : String(shiftReminder)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'off') setShiftReminder('off');
                    else setShiftReminder(Number(v));
                  }}
                >
                  <option value="off">Off</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={1440}>1 day</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                <input
                  type="checkbox"
                  checked={openSlotAlertsEnabled}
                  onChange={(e) => setOpenSlotAlertsEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                />
                <span className="text-[13px] leading-snug text-[#121212]">
                  <span className="font-medium">Notify me about new open bookable shifts</span>
                  <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                    You&apos;ll get rota notifications when a manager posts an open slot you can claim.
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    data-no-checkbox-sound
                    checked={uiSoundPrefs.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setUiSoundEnabled(enabled);
                      playUiSound(enabled ? 'toggle_on' : 'toggle_off');
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                  />
                  <span className="text-[13px] leading-snug text-[#121212]">
                    <span className="font-medium">UI sound effects</span>
                    <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                      Play subtle sounds for menus, toggles, sends, and notification actions.
                    </span>
                  </span>
                </label>
                <label className={`${fieldLabel} mt-3`}>
                  UI sound volume: {uiSoundPrefs.volume}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={uiSoundPrefs.volume}
                    onChange={(e) => setUiSoundVolume(Number.parseInt(e.target.value, 10))}
                    onMouseUp={() => playUiSound('toggle_on')}
                    onTouchEnd={() => playUiSound('toggle_on')}
                    disabled={!uiSoundPrefs.enabled}
                    className="mt-2 w-full accent-[#121212] disabled:opacity-50"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    data-no-checkbox-sound
                    checked={campfirePrefs.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setCampfireEnabled(enabled);
                      playUiSound(enabled ? 'toggle_on' : 'toggle_off');
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                  />
                  <span className="text-[13px] leading-snug text-[#121212]">
                    <span className="font-medium">Dashboard campfire ambience</span>
                    <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                      Soft crackling fire sound while you&apos;re on the home dashboard (separate from UI sounds).
                    </span>
                  </span>
                </label>
                <label className={`${fieldLabel} mt-3`}>
                  Campfire volume: {campfirePrefs.volume}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={campfirePrefs.volume}
                    onChange={(e) => setCampfireVolume(Number.parseInt(e.target.value, 10))}
                    onMouseUp={() => playUiSound('toggle_on')}
                    onTouchEnd={() => playUiSound('toggle_on')}
                    disabled={!campfirePrefs.enabled}
                    className="mt-2 w-full accent-[#121212] disabled:opacity-50"
                  />
                </label>
              </div>

              <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnPrimary}>
                {loading ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </div>
        )}

        {/* Channels tab */}
        {activeTab === 'channels' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>{settingsBroadcastChannelsTitle}</h2>
            <p className={sectionDesc}>{settingsBroadcastChannelsHelp}</p>
            {channelPrefs.length === 0 ? (
              <p className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3 text-[13px] text-[#9b9b9b]">
                No broadcast channels yet. Org admins add channels under Admin → Departments; then you can follow them here.
              </p>
            ) : (
              <div className="space-y-5">
                {channelsByDept.map(([deptName, rows]) => (
                  <div key={deptName}>
                    <p className="mb-2 text-[12px] font-semibold text-[#121212]">{deptName}</p>
                    <ul className="space-y-2">
                      {rows.map((c) => (
                        <li key={c.channel_id}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3.5 transition hover:border-[#c4c4c4]">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                              checked={c.subscribed}
                              disabled={channelBusyId === c.channel_id}
                              onChange={(e) => void toggleBroadcastChannel(c.channel_id, e.target.checked)}
                            />
                            <span className="text-[13px] leading-snug text-[#121212]">
                              <span className="font-medium">{c.name}</span>
                              <span className="mt-0.5 block text-[12.5px] font-normal text-[#6b6b6b]">
                                Follow to see targeted posts for this channel.
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Integrations tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <h2 className={sectionTitle}>Integrations</h2>
              <p className={sectionDesc}>
                Connect third-party services to enable additional features across the platform.
              </p>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-[#121212]">Google Calendar</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      HR can place interview slots on your calendar when you&apos;re on a panel.
                    </p>
                  </div>
                  <a href="/api/google/oauth/start?type=calendar" className={btnSecondary}>
                    Connect
                  </a>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-[#121212]">Google Sheets</p>
                    <p className="mt-0.5 text-[12.5px] text-[#6b6b6b]">
                      Import rota data from spreadsheets via Admin → Rota import.
                    </p>
                  </div>
                  <a href="/api/google/oauth/start?type=sheets" className={btnSecondary}>
                    Connect
                  </a>
                </div>
              </div>
            </div>
            {canManageDiscounts ? (
              <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
                <h2 className={sectionTitle}>Organisation tools</h2>
                <p className={sectionDesc}>Configure staff discount tiers shown on discount cards.</p>
                <Link href="/settings/discount-tiers" className={btnSecondary}>
                  Discount tiers
                </Link>
              </div>
            ) : null}
          </div>
        )}

        {/* Security tab */}
        {activeTab === 'security' && (
          <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
            <h2 className={sectionTitle}>Security</h2>
            <p className={sectionDesc}>Update your password. Use a strong, unique password.</p>
            <div className="space-y-4">
              {/* New password */}
              <label className={fieldLabel}>
                New password
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`${inputClass} mt-0 pr-10`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-[#121212]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              {/* Strength meter */}
              {password.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12px] text-[#9b9b9b]">Password strength</span>
                    {passwordStrength.label && (
                      <span className={`text-[12px] font-medium ${
                        passwordStrength.score === 4 ? 'text-emerald-600' :
                        passwordStrength.score === 3 ? 'text-yellow-600' :
                        passwordStrength.score === 2 ? 'text-orange-500' : 'text-red-500'
                      }`}>
                        {passwordStrength.label}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8e6e3]">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${passwordStrength.color}`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {[
                      { ok: password.length >= 8, label: 'At least 8 characters' },
                      { ok: /[A-Z]/.test(password) && /[a-z]/.test(password), label: 'Upper and lowercase letters' },
                      { ok: /[0-9]/.test(password), label: 'At least one number' },
                      { ok: /[^A-Za-z0-9]/.test(password), label: 'At least one special character' },
                    ].map((rule) => (
                      <li key={rule.label} className={`flex items-center gap-1.5 text-[12px] ${rule.ok ? 'text-emerald-600' : 'text-[#9b9b9b]'}`}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden>
                          {rule.ok
                            ? <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            : <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
                          }
                        </svg>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confirm password */}
              <label className={fieldLabel}>
                Confirm new password
                <div className="relative mt-1.5">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className={`${inputClass} mt-0 pr-10 ${
                      confirmPassword && !passwordsMatch ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9b9b] hover:text-[#121212]"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                    )}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="mt-1.5 text-[12px] text-red-500">Passwords do not match.</p>
                )}
              </label>

              <button
                type="button"
                disabled={loading || !passwordValid}
                onClick={() => void changePassword()}
                className={btnPrimary}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        )}

        {/* Account tab */}
        {activeTab === 'account' && (
          <div className="space-y-4">
            {/* Workspaces */}
            {tenantOrgs && tenantOrgs.length > 1 ? (
              <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
                <h2 className={sectionTitle}>Workspaces</h2>
                <p className={sectionDesc}>
                  Your account is linked to more than one organisation. Switch the active workspace to load the right dashboard, teams, and approvals.
                </p>
                <ul className="flex flex-col gap-2">
                  {tenantOrgs.map((o) => {
                    const isCurrent = o.org_id === currentOrgId;
                    return (
                      <li
                        key={o.org_id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e8e6e3] bg-[#faf9f6] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#121212]">{o.name}</p>
                          <p className="truncate font-mono text-[11px] text-[#9b9b9b]">{o.slug ?? '-'}</p>
                        </div>
                        {isCurrent ? (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#15803d]">
                            Current
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={tenantSwitching !== null}
                            onClick={() => void switchTenant(o.org_id)}
                            className={btnSecondary}
                          >
                            {tenantSwitching === o.org_id ? 'Switching...' : 'Switch'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Session */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
              <h2 className={sectionTitle}>Session</h2>
              <p className={sectionDesc}>Sign out of your current session on this device.</p>
              <button type="button" onClick={() => void logout()} className={btnSecondary}>
                Log out
              </button>
            </div>

            {/* Danger zone */}
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-5 sm:p-6">
              <h2 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-red-800/80">
                Danger zone
              </h2>
              <p className="mb-4 text-[13px] text-red-950/70">
                Deactivating removes your access until an administrator restores your account.
              </p>
              <button type="button" onClick={() => void deactivate()} disabled={loading} className={btnDanger}>
                Deactivate account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
