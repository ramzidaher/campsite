import { isApproverRole } from '@campsite/types';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { mainShell } from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';
import { useUiSound, useUiSoundPreferences } from '@/lib/sound/useUiSound';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type ChannelPref = {
  channel_id: string;
  name: string;
  dept_id: string;
  dept_name: string;
  subscribed: boolean;
};

function roleLabel(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'Org admin',
    super_admin: 'Org admin',
    manager: 'Manager',
    coordinator: 'Coordinator',
    administrator: 'Administrator',
    duty_manager: 'Duty manager',
    csa: 'CSA',
    society_leader: 'Society leader',
  };
  return m[role] ?? role;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const showApprovals = profile?.role ? isApproverRole(profile.role) : false;
  const configured = isSupabaseConfigured();
  const playUiSound = useUiSound();
  const { prefs: uiSoundPrefs, setEnabled: setUiSoundEnabled, setVolume: setUiSoundVolume } =
    useUiSoundPreferences();

  const [channelPrefs, setChannelPrefs] = useState<ChannelPref[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [busyChannelId, setBusyChannelId] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    if (!configured || !user?.id) return;
    setChannelsLoading(true);
    setChannelsError(null);
    const supabase = getSupabase();
    const orgId = profile?.org_id?.trim();
    if (!orgId) {
      setChannelPrefs([]);
      setChannelsLoading(false);
      return;
    }
    const { data: orgDepts, error: odErr } = await supabase
      .from('departments')
      .select('id, name')
      .eq('org_id', orgId)
      .eq('is_archived', false);
    if (odErr) {
      setChannelsError(odErr.message);
      setChannelsLoading(false);
      return;
    }
    const deptIds = [...new Set((orgDepts ?? []).map((d) => d.id as string).filter(Boolean))];
    if (!deptIds.length) {
      setChannelPrefs([]);
      setChannelsLoading(false);
      return;
    }
    const [{ data: chans, error: cErr }, { data: subs, error: sErr }] = await Promise.all([
      supabase.from('broadcast_channels').select('id, name, dept_id').in('dept_id', deptIds).order('name'),
      supabase.from('user_subscriptions').select('channel_id, subscribed').eq('user_id', user.id),
    ]);
    if (cErr || sErr) {
      setChannelsError(cErr?.message ?? sErr?.message ?? 'Could not load channels');
      setChannelsLoading(false);
      return;
    }
    const subMap = new Map((subs ?? []).map((x) => [x.channel_id as string, Boolean(x.subscribed)]));
    const deptNameById = new Map<string, string>();
    for (const d of orgDepts ?? []) {
      const did = d.id as string;
      const n = String(d.name ?? '').trim();
      deptNameById.set(did, n || 'Department');
    }
    const next: ChannelPref[] = (chans ?? []).map((c) => {
      const id = c.id as string;
      return {
        channel_id: id,
        name: String(c.name ?? ''),
        dept_id: c.dept_id as string,
        dept_name: deptNameById.get(c.dept_id as string) ?? 'Team',
        subscribed: subMap.get(id) ?? false,
      };
    });
    next.sort((a, b) => a.dept_name.localeCompare(b.dept_name) || a.name.localeCompare(b.name));
    setChannelPrefs(next);
    setChannelsLoading(false);
  }, [configured, user?.id, profile?.org_id]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const channelsByDept = useMemo(() => {
    const m = new Map<string, ChannelPref[]>();
    for (const c of channelPrefs) {
      const list = m.get(c.dept_name) ?? [];
      list.push(c);
      m.set(c.dept_name, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [channelPrefs]);

  async function toggleChannel(channelId: string, next: boolean) {
    if (!user?.id) return;
    const snapshot = channelPrefs;
    setChannelPrefs((p) => p.map((c) => (c.channel_id === channelId ? { ...c, subscribed: next } : c)));
    setBusyChannelId(channelId);
    const supabase = getSupabase();
    const { error } = await supabase.from('user_subscriptions').upsert(
      { user_id: user.id, channel_id: channelId, subscribed: next },
      { onConflict: 'user_id,channel_id' }
    );
    setBusyChannelId(null);
    if (error) {
      setChannelPrefs(snapshot);
      setChannelsError(error.message);
    }
  }

  return (
    <View style={styles.root}>
      <AppMobileHeader />
      <ScrollView
        style={[styles.screen, { backgroundColor: mainShell.pageBg }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.name}>{profile?.full_name?.trim() || 'Member'}</Text>
          {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
          {profile?.role ? (
            <Text style={styles.meta}>{roleLabel(profile.role)}</Text>
          ) : null}
        </View>

        {showApprovals ? (
          <Pressable
            style={styles.row}
            onPress={() => {
              playUiSound('menu_open');
              router.push('/pending-approvals');
            }}
          >
            <Text style={styles.rowIcon}>⏳</Text>
            <Text style={styles.rowText}>Pending approvals</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ) : null}

        <Text style={styles.section}>Broadcast channels</Text>
        <Text style={styles.hint}>
          Channels are listed for every department in your organisation. Follow a channel to receive its targeted posts.
          Mandatory and org-wide sends bypass these choices.
        </Text>
        {channelsLoading ? (
          <ActivityIndicator style={{ marginBottom: 20 }} color={mainShell.pageText} />
        ) : null}
        {channelsError ? (
          <Text style={[styles.hint, { color: '#b91c1c', marginBottom: 16 }]}>{channelsError}</Text>
        ) : null}
        {!channelsLoading && channelPrefs.length === 0 ? (
          <Text style={[styles.hint, { marginBottom: 24 }]}>
            No broadcast channels yet. Org admins add them under department settings; then you can follow them here.
          </Text>
        ) : null}
        {channelsByDept.map(([deptName, rows]) => (
          <View key={deptName} style={styles.channelDeptBlock}>
            <Text style={styles.channelDeptTitle}>{deptName}</Text>
            {rows.map((c) => (
              <View key={c.channel_id} style={styles.channelRow}>
                <View style={styles.channelRowText}>
                  <Text style={styles.channelName}>{c.name}</Text>
                  <Text style={styles.channelSub}>Follow to see targeted posts</Text>
                </View>
                <Switch
                  value={c.subscribed}
                  disabled={busyChannelId === c.channel_id}
                  onValueChange={(v) => void toggleChannel(c.channel_id, v)}
                />
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.section}>UI sounds</Text>
        <Text style={styles.hint}>
          Play subtle sounds for navigation, dropdowns, and action confirmations.
        </Text>
        <View style={styles.channelRow}>
          <View style={styles.channelRowText}>
            <Text style={styles.channelName}>Enable UI sounds</Text>
            <Text style={styles.channelSub}>Turn all interaction sounds on or off.</Text>
          </View>
          <Switch
            value={uiSoundPrefs.enabled}
            onValueChange={(value) => {
              setUiSoundEnabled(value);
              playUiSound(value ? 'toggle_on' : 'toggle_off');
            }}
          />
        </View>
        <View style={styles.sliderWrap}>
          <Text style={styles.channelName}>Volume: {uiSoundPrefs.volume}%</Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={uiSoundPrefs.volume}
            onValueChange={(value) => setUiSoundVolume(value)}
            onSlidingComplete={() => playUiSound('toggle_on')}
            minimumTrackTintColor={mainShell.pageText}
            maximumTrackTintColor={mainShell.border}
            thumbTintColor={mainShell.pageText}
            disabled={!uiSoundPrefs.enabled}
          />
        </View>

        <Text style={styles.section}>Account</Text>
        <Text style={styles.hint}>Additional notification preferences match web Settings where available.</Text>

        <Pressable
          style={styles.signOut}
          onPress={() => {
            void signOut().then(() => router.replace('/(auth)/login'));
          }}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: mainShell.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mainShell.border,
    padding: 16,
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: mainShell.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  name: { fontSize: 18, fontWeight: '600', color: mainShell.pageText },
  meta: { fontSize: 14, color: mainShell.textSecondary, marginTop: 4 },
  section: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: mainShell.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  hint: { fontSize: 14, lineHeight: 21, color: mainShell.textSecondary, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  rowIcon: { fontSize: 18 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500', color: mainShell.pageText },
  chev: { fontSize: 18, color: mainShell.textMuted },
  channelDeptBlock: { marginBottom: 20 },
  channelDeptTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: mainShell.pageText,
    marginBottom: 8,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: mainShell.surface,
    marginBottom: 8,
  },
  channelRowText: { flex: 1, minWidth: 0 },
  channelName: { fontSize: 15, fontWeight: '500', color: mainShell.pageText },
  channelSub: { fontSize: 12, color: mainShell.textSecondary, marginTop: 2 },
  sliderWrap: {
    paddingHorizontal: 6,
    marginBottom: 18,
  },
  signOut: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mainShell.border,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#b91c1c' },
});
