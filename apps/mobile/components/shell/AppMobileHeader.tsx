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

import { mainShell, mainScreenTitle } from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';
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
  const [hasNotifDot, setHasNotifDot] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured() || !user) {
        setHasNotifDot(false);
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          const { data, error } = await getSupabase().rpc('broadcast_unread_count');
          if (cancelled || error) return;
          const n = typeof data === 'number' ? data : Number(data);
          setHasNotifDot(!Number.isNaN(n) && n > 0);
        } catch {
          setHasNotifDot(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const title = useMemo(() => mainScreenTitle(pathname ?? ''), [pathname]);

  const isStackAuxScreen =
    pathname === '/settings' ||
    pathname === '/pending-approvals' ||
    pathname?.endsWith('/settings') ||
    pathname?.endsWith('/pending-approvals');

  const onBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);
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
          <Pressable
            onPress={() => router.push('/(tabs)/broadcasts')}
            style={styles.iconBtn}
            accessibilityLabel="Broadcasts"
          >
            <Text style={styles.iconBtnGlyph}>🔔</Text>
            {hasNotifDot ? <View style={styles.notifDot} /> : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
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
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    marginRight: 4,
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
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '400',
    color: mainShell.pageText,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  iconBtnGlyph: { fontSize: 16 },
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
    fontSize: 12,
    fontWeight: '600',
    color: mainShell.sidebarText,
  },
});
