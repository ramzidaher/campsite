import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import { ProfileSettings } from '@/components/ProfileSettings';
import { getCelebrationModeOptions, type OrgCelebrationModeOverride } from '@/lib/holidayThemes';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

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
  const googleFlashTone =
    sp.google_connected === '1' ? ('success' as const) : sp.google_error ? ('error' as const) : null;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) {
    redirect('/login');
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name,avatar_url,role,accent_preset,color_scheme,celebration_mode,celebration_auto_enabled,ui_mode,dnd_enabled,dnd_start,dnd_end,shift_reminder_before_minutes,rota_open_slot_alerts_enabled,org_id'
    )
    .eq('id', user.id)
    .single();

  let tenantOrgs: LoginOrgOption[] | null = null;
  const { data: memRows, error: memErr } = await supabase
    .from('user_org_memberships')
    .select('org_id, organisations(name, slug)')
    .eq('user_id', user.id);
  if (!memErr && memRows?.length) {
    tenantOrgs = memRows
      .map((r) => {
        const o = r.organisations as { name?: string; slug?: string } | null;
        return {
          org_id: r.org_id as string,
          name: o?.name?.trim() || 'Organisation',
          slug: o?.slug?.trim() || '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const orgId = profile?.org_id as string | undefined;
  let orgCelebrationOverrides: OrgCelebrationModeOverride[] = [];
  if (orgId) {
    const [{ data: celebrationRows }] = await Promise.all([
      supabase
        .from('org_celebration_modes')
        .select(
          'mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
        )
        .eq('org_id', orgId)
        .order('display_order', { ascending: true })
        .order('label', { ascending: true }),
    ]);
    orgCelebrationOverrides = (celebrationRows ?? []) as OrgCelebrationModeOverride[];
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-6 sm:px-[28px]">
      <header className="mb-7">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">Manage your profile, preferences, and account security.</p>
      </header>
      <ProfileSettings
        googleFlash={googleFlash}
        googleFlashTone={googleFlashTone}
        tenantOrgs={tenantOrgs}
        currentOrgId={profile?.org_id ?? null}
        initial={
            profile
              ? {
                  full_name: profile.full_name,
                  avatar_url: profile.avatar_url,
                  role: profile.role,
                  accent_preset: profile.accent_preset,
                  color_scheme: profile.color_scheme,
                  celebration_mode: profile.celebration_mode,
                  celebration_auto_enabled: profile.celebration_auto_enabled,
                  ui_mode: profile.ui_mode,
                  dnd_enabled: profile.dnd_enabled,
                  dnd_start: profile.dnd_start,
                  dnd_end: profile.dnd_end,
                  shift_reminder_before_minutes: profile.shift_reminder_before_minutes,
                  rota_open_slot_alerts_enabled: profile.rota_open_slot_alerts_enabled,
                }
              : null
          }
        initialBroadcastChannels={[]}
        canManageDiscounts={false}
        celebrationModeOptions={getCelebrationModeOptions(orgCelebrationOverrides)}
      />
    </div>
  );
}
