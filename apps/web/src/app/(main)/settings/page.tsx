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

  type BroadcastChannelPref = {
    channel_id: string;
    name: string;
    dept_id: string;
    dept_name: string;
    subscribed: boolean;
  };

  const broadcastChannelPrefs: BroadcastChannelPref[] = [];
  const orgId = profile?.org_id as string | undefined;
  let canManageDiscounts = false;
  let orgCelebrationOverrides: OrgCelebrationModeOverride[] = [];
  if (orgId) {
    const [{ data: orgDepts }, { data: subs }, { data: hasDiscounts }, { data: celebrationRows }] = await Promise.all([
      supabase.from('departments').select('id, name').eq('org_id', orgId).eq('is_archived', false),
      supabase.from('user_subscriptions').select('channel_id, subscribed').eq('user_id', user.id),
      supabase.rpc('has_permission', {
        p_user_id: user.id,
        p_org_id: orgId,
        p_permission_key: 'discounts.view',
        p_context: {},
      }),
      supabase
        .from('org_celebration_modes')
        .select(
          'mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
        )
        .eq('org_id', orgId)
        .order('display_order', { ascending: true })
        .order('label', { ascending: true }),
    ]);
    canManageDiscounts = Boolean(hasDiscounts);
    orgCelebrationOverrides = (celebrationRows ?? []) as OrgCelebrationModeOverride[];
    const deptIds = [...new Set((orgDepts ?? []).map((d) => d.id as string).filter(Boolean))];
    if (deptIds.length) {
      const { data: chans } = await supabase
        .from('broadcast_channels')
        .select('id, name, dept_id')
        .in('dept_id', deptIds)
        .order('name');
      const subMap = new Map(
        (subs ?? []).map((s) => [s.channel_id as string, Boolean(s.subscribed)])
      );
      const deptNameById = new Map<string, string>();
      for (const d of orgDepts ?? []) {
        const did = d.id as string;
        const n = String(d.name ?? '').trim();
        deptNameById.set(did, n || 'Department');
      }
      for (const c of chans ?? []) {
        const id = c.id as string;
        broadcastChannelPrefs.push({
          channel_id: id,
          name: String(c.name ?? ''),
          dept_id: c.dept_id as string,
          dept_name: deptNameById.get(c.dept_id as string) ?? 'Department',
          subscribed: subMap.get(id) ?? false,
        });
      }
      broadcastChannelPrefs.sort(
        (a, b) => a.dept_name.localeCompare(b.dept_name) || a.name.localeCompare(b.name)
      );
    }
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
        initialBroadcastChannels={broadcastChannelPrefs}
        canManageDiscounts={canManageDiscounts}
        celebrationModeOptions={getCelebrationModeOptions(orgCelebrationOverrides)}
      />
    </div>
  );
}
