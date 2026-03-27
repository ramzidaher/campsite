import { ProfileSettings } from '@/components/ProfileSettings';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>;
}) {
  const sp = await searchParams;
  const googleFlash =
    sp.google_connected === '1'
      ? 'Google account connected.'
      : sp.google_error
        ? `Google: ${sp.google_error}`
        : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name,avatar_url,role,accent_preset,color_scheme,dnd_enabled,dnd_start,dnd_end,shift_reminder_before_minutes'
    )
    .eq('id', user.id)
    .single();

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Settings</h1>
      <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
        Profile, appearance, and security.
      </p>
      <div className="mt-8">
        <ProfileSettings
          googleFlash={googleFlash}
          initial={
            profile
              ? {
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  role: profile.role,
                  accent_preset: profile.accent_preset,
                  color_scheme: profile.color_scheme,
                  dnd_enabled: profile.dnd_enabled,
                  dnd_start: profile.dnd_start,
                  dnd_end: profile.dnd_end,
                  shift_reminder_before_minutes: profile.shift_reminder_before_minutes,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
