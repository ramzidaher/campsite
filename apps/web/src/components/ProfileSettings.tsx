'use client';

import { accentPresets, type AccentPreset } from '@campsite/theme';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isOrgAdminRole } from '@campsite/types';
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

export function ProfileSettings({
  initial,
  googleFlash,
}: {
  initial: Profile | null;
  googleFlash?: string | null;
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProfile(initial);
    const m = initial?.shift_reminder_before_minutes;
    setShiftReminder(m == null ? 'off' : m);
  }, [initial]);

  async function saveProfile() {
    setLoading(true);
    setMsg(null);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // Omit role/org_id/status — RLS self-update + trigger block self role; status only via deactivate().
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
      setMsg(error.message);
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  async function changePassword() {
    if (!password) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setPassword('');
    setMsg('Password updated.');
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
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
      setMsg(error.message);
      return;
    }
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (!profile) {
    return <p className="text-sm text-[var(--campsite-text-secondary)]">Loading profile…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
          Profile
        </h2>
        <label className="block text-sm">
          Full name
          <input
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Avatar URL
          <input
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <p className="text-sm text-[var(--campsite-text-secondary)]">
          Role: <span className="font-mono text-[var(--campsite-text)]">{profile.role}</span> — contact
          an admin to change teams.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void saveProfile()}
          className="rounded-lg bg-[var(--campsite-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Save profile
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
          Appearance
        </h2>
        <label className="block text-sm">
          Colour scheme
          <select
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
            value={scheme}
            onChange={(e) => setScheme(e.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="block text-sm">
          Accent
          <select
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          >
            {(Object.keys(accentPresets) as AccentPreset[]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void saveProfile()}
          className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
        >
          Save appearance
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
          Notifications
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dnd} onChange={(e) => setDnd(e.target.checked)} />
          Do Not Disturb hours
        </label>
        {dnd ? (
          <div className="flex gap-2">
            <input
              type="time"
              className="rounded border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-2 py-1 text-sm"
              value={dndStart}
              onChange={(e) => setDndStart(e.target.value)}
            />
            <span className="self-center text-sm">to</span>
            <input
              type="time"
              className="rounded border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-2 py-1 text-sm"
              value={dndEnd}
              onChange={(e) => setDndEnd(e.target.value)}
            />
          </div>
        ) : null}
        <label className="block text-sm">
          Shift reminder (before start)
          <select
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
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
        <button
          type="button"
          disabled={loading}
          onClick={() => void saveProfile()}
          className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
        >
          Save notification preferences
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
          Integrations
        </h2>
        <p className="text-sm text-[var(--campsite-text-secondary)]">
          Connect Google to sync your calendar or import a rota from Sheets (rota import: Admin → Rota
          import).
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/google/oauth/start?type=calendar"
            className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
          >
            Connect Google Calendar
          </a>
          <a
            href="/api/google/oauth/start?type=sheets"
            className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
          >
            Connect Google Sheets
          </a>
        </div>
      </section>

      {isOrgAdminRole(profile.role) ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
            Organisation
          </h2>
          <p className="text-sm text-[var(--campsite-text-secondary)]">
            Configure staff discount tiers shown on discount cards.
          </p>
          <Link
            href="/settings/discount-tiers"
            className="inline-block rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
          >
            Discount tiers
          </Link>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
          Security
        </h2>
        <label className="block text-sm">
          New password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button
          type="button"
          disabled={loading || !password}
          onClick={() => void changePassword()}
          className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
        >
          Update password
        </button>
      </section>

      <section className="space-y-3 border-t border-[var(--campsite-border)] pt-6">
        <button
          type="button"
          onClick={() => void logout()}
          className="rounded-lg border border-[var(--campsite-border)] px-4 py-2 text-sm font-medium"
        >
          Log out
        </button>
        <button
          type="button"
          onClick={() => void deactivate()}
          className="block rounded-lg bg-[var(--campsite-warning)] px-4 py-2 text-sm font-medium text-white"
        >
          Deactivate account
        </button>
      </section>

      {msg ? <p className="text-sm text-[var(--campsite-text-secondary)]">{msg}</p> : null}
    </div>
  );
}
