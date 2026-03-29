import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
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
  const googleFlashTone =
    sp.google_connected === '1' ? ('success' as const) : sp.google_error ? ('error' as const) : null;
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
      'full_name,avatar_url,role,accent_preset,color_scheme,dnd_enabled,dnd_start,dnd_end,shift_reminder_before_minutes,org_id'
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

  const { data: userDeptRows } = await supabase
    .from('user_departments')
    .select('dept_id, departments(name)')
    .eq('user_id', user.id);

  const deptIds = [...new Set((userDeptRows ?? []).map((r) => r.dept_id as string).filter(Boolean))];

  type BroadcastChannelPref = {
    channel_id: string;
    name: string;
    dept_id: string;
    dept_name: string;
    subscribed: boolean;
  };

  let broadcastChannelPrefs: BroadcastChannelPref[] = [];
  if (deptIds.length) {
    const [{ data: chans }, { data: subs }] = await Promise.all([
      supabase.from('broadcast_channels').select('id, name, dept_id').in('dept_id', deptIds).order('name'),
      supabase.from('user_subscriptions').select('channel_id, subscribed').eq('user_id', user.id),
    ]);
    const subMap = new Map(
      (subs ?? []).map((s) => [s.channel_id as string, Boolean(s.subscribed)])
    );
    const deptNameById = new Map<string, string>();
    for (const r of userDeptRows ?? []) {
      const did = r.dept_id as string;
      const rel = r.departments as { name: string } | { name: string }[] | null;
      const n = Array.isArray(rel) ? rel[0]?.name : rel?.name;
      deptNameById.set(did, (n ?? 'Team').trim() || 'Team');
    }
    for (const c of chans ?? []) {
      const id = c.id as string;
      broadcastChannelPrefs.push({
        channel_id: id,
        name: String(c.name ?? ''),
        dept_id: c.dept_id as string,
        dept_name: deptNameById.get(c.dept_id as string) ?? 'Team',
        subscribed: subMap.get(id) ?? false,
      });
    }
    broadcastChannelPrefs.sort(
      (a, b) => a.dept_name.localeCompare(b.dept_name) || a.name.localeCompare(b.name)
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-6 sm:px-[28px]">
      <header className="mb-8">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">Profile, appearance, notifications, and security.</p>
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
                  dnd_enabled: profile.dnd_enabled,
                  dnd_start: profile.dnd_start,
                  dnd_end: profile.dnd_end,
                  shift_reminder_before_minutes: profile.shift_reminder_before_minutes,
                }
              : null
          }
        initialBroadcastChannels={broadcastChannelPrefs}
      />
    </div>
  );
}
