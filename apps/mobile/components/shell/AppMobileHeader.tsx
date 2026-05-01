import { useFocusEffect } from '@react-navigation/native';
import { useRouter, usePathname } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  homeHeaderTitle,
  isHomeTabPathname,
  mainScreenTitle,
  mainShell,
  mainShellText,
} from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';
import { useUiSound } from '@/lib/sound/useUiSound';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AppMobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const playUiSound = useUiSound();
  const [hasNotifDot, setHasNotifDot] = useState(false);
  const [hasRecruitmentDot, setHasRecruitmentDot] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured() || !user) {
        setHasNotifDot(false);
        setHasRecruitmentDot(false);
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          const supabase = getSupabase();
          const [{ data: bc }, { data: rn }, { data: an }, { data: ln }, { data: hm }] = await Promise.all([
            supabase.rpc('broadcast_unread_count'),
            supabase.rpc('recruitment_notifications_unread_count'),
            supabase.rpc('application_notifications_unread_count'),
            supabase.rpc('leave_notifications_unread_count'),
            supabase.rpc('hr_metric_notifications_unread_count'),
          ]);
          if (cancelled) return;
          const broadcastN = typeof bc === 'number' ? bc : Number(bc);
          const recruitN = typeof rn === 'number' ? rn : Number(rn);
          const appN = typeof an === 'number' ? an : Number(an);
          const leaveN = typeof ln === 'number' ? ln : Number(ln);
          const hrMetricN = typeof hm === 'number' ? hm : Number(hm);
          setHasNotifDot(
            (!Number.isNaN(broadcastN) && broadcastN > 0) ||
              (!Number.isNaN(appN) && appN > 0) ||
              (!Number.isNaN(leaveN) && leaveN > 0) ||
              (!Number.isNaN(hrMetricN) && hrMetricN > 0),
          );
          setHasRecruitmentDot(!Number.isNaN(recruitN) && recruitN > 0);
        } catch {
          setHasNotifDot(false);
          setHasRecruitmentDot(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const title = useMemo(() => {
    const p = pathname ?? '';
    if (isHomeTabPathname(p)) {
      return homeHeaderTitle(profile?.full_name);
    }
    return mainScreenTitle(p);
  }, [pathname, profile?.full_name]);

  const isStackAuxScreen =
    pathname === '/settings' ||
    pathname === '/pending-approvals' ||
    pathname === '/broadcast-pending' ||
    pathname?.startsWith('/resources') ||
    pathname?.endsWith('/settings') ||
    pathname?.endsWith('/pending-approvals') ||
    pathname?.endsWith('/broadcast-pending');

  const onBack = useCallback(() => {
    playUiSound('menu_close');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [playUiSound, router]);
  const userInitials = useMemo(
    () => initials((profile?.full_name ?? user?.email ?? '?').trim() || '?'),
    [profile?.full_name, user?.email]
  );

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.row}>
        {isStackAuxScreen ? (
          <Pressable
            onPress={onBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.actions}>
          {hasRecruitmentDot ? (
            <Pressable
              onPress={() => {
                playUiSound('menu_open');
                router.push('/(tabs)/hr');
              }}
              style={styles.iconBtn}
              accessibilityLabel="Recruitment updates"
            >
              <Text style={styles.iconBtnGlyph}>💼</Text>
              <View style={styles.notifDot} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              playUiSound('menu_open');
              router.push('/(tabs)/broadcasts');
            }}
            style={styles.iconBtn}
            accessibilityLabel="Broadcasts"
          >
            <Text style={styles.iconBtnGlyph}>🔔</Text>
            {hasNotifDot ? <View style={styles.notifDot} /> : null}
          </Pressable>
          <Pressable
            onPress={() => {
              playUiSound('menu_open');
              router.push('/settings');
            }}
            style={styles.avatarBtn}
            accessibilityLabel="Settings"
          >
            <Text style={styles.avatarText}>{userInitials}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: mainShell.topBarBg,
    borderBottomWidth: 1,
    borderBottomColor: mainShell.border,
  },
  row: {
    height: 56,
    paddingHorizontal: mainShell.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: mainShell.spacing.xs,
  },
  backBtn: {
    width: 36,
    height: 36,
    marginRight: mainShell.spacing.xxs,
    marginLeft: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: 28,
    lineHeight: 30,
    color: mainShell.pageText,
    fontWeight: '400',
  },
  title: {
    flex: 1,
    ...mainShellText.sectionTitle,
    lineHeight: 26,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
    color: mainShell.pageText,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: mainShell.spacing.xs },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnGlyph: { fontSize: mainShell.type.subheading + 1 },
  notifDot: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: mainShell.accentDot,
    borderWidth: 2,
    borderColor: mainShell.topBarBg,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: mainShell.sidebarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...mainShellText.caption,
    fontWeight: '600',
    color: mainShell.sidebarText,
  },
});
