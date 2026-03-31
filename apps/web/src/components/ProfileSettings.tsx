'use client';

import { accentPresets, type AccentPreset } from '@campsite/theme';
import {
  settingsBroadcastChannelsHelp,
  settingsBroadcastChannelsTitle,
} from '@/lib/broadcasts/channelCopy';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isOrgAdminRole } from '@campsite/types';
import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import { createClient } from '@/lib/supabase/client';

type Profile = {
  full_name: string;
  avatar_url: string | null;
  role: string;
  accent_preset: string;
  color_scheme: string;
  dnd_enabled: boolean;
  dnd_start: string | null;
  dnd_end: string | null;
  shift_reminder_before_minutes: number | null;
};

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

const fieldLabel = 'block text-[13px] font-medium text-[#121212]';
const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] shadow-sm outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-1 focus:ring-[#121212]';
const selectClass = inputClass;
const sectionCard = 'rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6';
const sectionTitle = 'mb-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]';
const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition hover:bg-[#2a2a2a] disabled:pointer-events-none disabled:opacity-45';
const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-[13px] font-medium text-[#121212] transition hover:bg-[#f5f4f1] disabled:pointer-events-none disabled:opacity-45';
const btnDanger =
  'inline-flex items-center justify-center rounded-lg border border-[#b91c1c]/35 bg-[#b91c1c] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#991b1b] disabled:pointer-events-none disabled:opacity-45';

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
}: {
  initial: Profile | null;
  googleFlash?: string | null;
  googleFlashTone?: 'success' | 'error' | null;
  /** When the user belongs to multiple workspaces (see user_org_memberships). */
  tenantOrgs?: LoginOrgOption[] | null;
  currentOrgId?: string | null;
  initialBroadcastChannels?: BroadcastChannelPref[];
}) {
  const router = useRouter();
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
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(googleFlash ?? null);
  const [msgTone, setMsgTone] = useState<'success' | 'error' | 'neutral'>(() => {
    if (googleFlashTone === 'success') return 'success';
    if (googleFlashTone === 'error') return 'error';
    return 'neutral';
  });
  const [loading, setLoading] = useState(false);
  const [tenantSwitching, setTenantSwitching] = useState<string | null>(null);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);
  const [channelPrefs, setChannelPrefs] = useState<BroadcastChannelPref[]>(initialBroadcastChannels);
  const [channelBusyId, setChannelBusyId] = useState<string | null>(null);

  const safeAvatar = useMemo(() => safeHttpImageUrl(avatarUrl), [avatarUrl]);

  useEffect(() => {
    setAvatarPreviewFailed(false);
  }, [safeAvatar]);

  useEffect(() => {
    setProfile(initial);
    const m = initial?.shift_reminder_before_minutes;
    setShiftReminder(m == null ? 'off' : m);
  }, [initial]);

  useEffect(() => {
    setChannelPrefs(initialBroadcastChannels);
  }, [initialBroadcastChannels]);

  useEffect(() => {
    setMsg(googleFlash ?? null);
    if (googleFlashTone === 'success') setMsgTone('success');
    else if (googleFlashTone === 'error') setMsgTone('error');
    else if (googleFlash != null) setMsgTone('neutral');
  }, [googleFlash, googleFlashTone]);

  function setFeedback(text: string, tone: 'success' | 'error' | 'neutral') {
    setMsg(text);
    setMsgTone(tone);
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

  async function toggleBroadcastChannel(channelId: string, next: boolean) {
    const snapshot = channelPrefs;
    setChannelPrefs((p) => p.map((c) => (c.channel_id === channelId ? { ...c, subscribed: next } : c)));
    setChannelBusyId(channelId);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setChannelPrefs(snapshot);
      setChannelBusyId(null);
      return;
    }
    const { error } = await supabase.from('user_subscriptions').upsert(
      { user_id: u.user.id, channel_id: channelId, subscribed: next },
      { onConflict: 'user_id,channel_id' }
    );
    setChannelBusyId(null);
    if (error) {
      setChannelPrefs(snapshot);
      setFeedback(error.message, 'error');
    }
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
        dnd_enabled: dnd,
        dnd_start: dnd ? dndStart : null,
        dnd_end: dnd ? dndEnd : null,
        shift_reminder_before_minutes: shiftReminder === 'off' ? null : shiftReminder,
      })
      .eq('id', u.user.id);
    setLoading(false);
    if (error) {
      setFeedback(error.message, 'error');
      return;
    }
    setFeedback('Saved.', 'success');
    router.refresh();
  }

  async function changePassword() {
    if (!password) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setFeedback(error.message, 'error');
      return;
    }
    setPassword('');
    setFeedback('Password updated.', 'success');
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
    if (error) {
      setFeedback(error.message, 'error');
      return;
    }
    setFeedback('Switched workspace.', 'success');
    router.refresh();
  }

  async function deactivate() {
    if (!confirm('Deactivate your account? You can ask an admin to restore access.')) return;
    setLoading(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'inactive' })
      .eq('id', u.user.id);
    setLoading(false);
    if (error) {
      setFeedback(error.message, 'error');
      return;
    }
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
      <div className={sectionCard}>
        <p className="text-[13px] text-[#6b6b6b]">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {msg ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-[13px] ${flashClass}`}
        >
          {msg}
        </div>
      ) : null}

      {tenantOrgs && tenantOrgs.length > 1 ? (
        <section className={sectionCard} aria-labelledby="settings-workspaces-heading">
          <h2 id="settings-workspaces-heading" className={sectionTitle}>
            Workspaces
          </h2>
          <p className="mb-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            Your account is linked to more than one organisation. Switch the active workspace to load the
            right dashboard, teams, and approvals.
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
                    <p className="truncate font-mono text-[11px] text-[#9b9b9b]">
                      {o.slug ?? '-'}
                    </p>
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
        </section>
      ) : null}

      <section className={sectionCard} aria-labelledby="settings-profile-heading">
        <h2 id="settings-profile-heading" className={sectionTitle}>
          Profile
        </h2>
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
            <p className="rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#6b6b6b]">
              <span className="font-medium text-[#121212]">{profileRoleDisplay(profile.role)}</span>
              <span className="text-[#9b9b9b]"> · </span>
              Contact an admin if you need a different role or team.
            </p>
            <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnPrimary}>
              Save profile
            </button>
          </div>
        </div>
      </section>

      <section className={sectionCard} aria-labelledby="settings-appearance-heading">
        <h2 id="settings-appearance-heading" className={sectionTitle}>
          Appearance
        </h2>
        <div className="space-y-4">
          <label className={fieldLabel}>
            Colour scheme
            <select className={selectClass} value={scheme} onChange={(e) => setScheme(e.target.value)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className={fieldLabel}>
            Accent
            <select className={selectClass} value={accent} onChange={(e) => setAccent(e.target.value)}>
              {(Object.keys(accentPresets) as AccentPreset[]).map((k) => (
                <option key={k} value={k}>
                  {accentLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnSecondary}>
            Save appearance
          </button>
        </div>
      </section>

      <section className={sectionCard} aria-labelledby="settings-notifications-heading">
        <h2 id="settings-notifications-heading" className={sectionTitle}>
          Notifications
        </h2>
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
          <button type="button" disabled={loading} onClick={() => void saveProfile()} className={btnSecondary}>
            Save notification preferences
          </button>
        </div>
      </section>

      <section className={sectionCard} aria-labelledby="settings-broadcast-channels-heading">
        <h2 id="settings-broadcast-channels-heading" className={sectionTitle}>
          {settingsBroadcastChannelsTitle}
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[#6b6b6b]">{settingsBroadcastChannelsHelp}</p>
        {channelPrefs.length === 0 ? (
          <p className="text-[13px] text-[#9b9b9b]">
            No teams or channels yet. After an admin adds you to a department with channels, they appear here.
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
      </section>

      <section className={sectionCard} aria-labelledby="settings-integrations-heading">
        <h2 id="settings-integrations-heading" className={sectionTitle}>
          Integrations
        </h2>
        <p className="mb-4 text-[13px] leading-relaxed text-[#6b6b6b]">
          Connect Google to sync your calendar or import a rota from Sheets (rota import: Admin → Rota import).
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/google/oauth/start?type=calendar" className={btnSecondary}>
            Connect Google Calendar
          </a>
          <a href="/api/google/oauth/start?type=sheets" className={btnSecondary}>
            Connect Google Sheets
          </a>
        </div>
      </section>

      {isOrgAdminRole(profile.role) ? (
        <section className={sectionCard} aria-labelledby="settings-org-heading">
          <h2 id="settings-org-heading" className={sectionTitle}>
            Organisation
          </h2>
          <p className="mb-4 text-[13px] text-[#6b6b6b]">
            Configure staff discount tiers shown on discount cards.
          </p>
          <Link href="/settings/discount-tiers" className={btnSecondary}>
            Discount tiers
          </Link>
        </section>
      ) : null}

      <section className={sectionCard} aria-labelledby="settings-security-heading">
        <h2 id="settings-security-heading" className={sectionTitle}>
          Security
        </h2>
        <div className="space-y-4">
          <label className={fieldLabel}>
            New password
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            type="button"
            disabled={loading || !password}
            onClick={() => void changePassword()}
            className={btnSecondary}
          >
            Update password
          </button>
        </div>
      </section>

      <section
        className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6"
        aria-labelledby="settings-session-heading"
      >
        <h2 id="settings-session-heading" className={sectionTitle}>
          Session
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button type="button" onClick={() => void logout()} className={btnSecondary}>
            Log out
          </button>
        </div>
      </section>

      <section
        className="rounded-xl border border-red-200 bg-red-50/60 p-5 sm:p-6"
        aria-labelledby="settings-danger-heading"
      >
        <h2 id="settings-danger-heading" className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-red-800/80">
          Danger zone
        </h2>
        <p className="mb-4 text-[13px] text-red-950/70">
          Deactivating removes your access until an administrator restores your account.
        </p>
        <button type="button" onClick={() => void deactivate()} disabled={loading} className={btnDanger}>
          Deactivate account
        </button>
      </section>
    </div>
  );
}
