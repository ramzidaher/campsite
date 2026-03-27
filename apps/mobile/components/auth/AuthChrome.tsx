import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authColors, authRadii } from '@/constants/authTheme';

const extra = Constants.expoConfig?.extra as
  | { orgDisplayName?: string; orgHostLabel?: string }
  | undefined;

function orgInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AuthOrgCardMobile({ hideChange }: { hideChange?: boolean }) {
  const displayName = extra?.orgDisplayName?.trim() || 'Campsite';
  const hostLabel = extra?.orgHostLabel?.trim() || 'Mobile app';
  const initials = orgInitials(displayName);

  return (
    <View style={styles.orgCard}>
      <View style={styles.orgAvatar}>
        <Text style={styles.orgAvatarText}>{initials}</Text>
      </View>
      <View style={styles.orgTextWrap}>
        <Text style={styles.orgTitle} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.orgSub} numberOfLines={1}>
          {hostLabel}
        </Text>
      </View>
      {hideChange ? null : (
        <Link href="/(auth)/register" asChild>
          <Pressable style={styles.orgChangeHit} hitSlop={8}>
            <Text style={styles.orgChange}>Change</Text>
          </Pressable>
        </Link>
      )}
    </View>
  );
}

export function AuthChrome({
  children,
  hideOrgChange,
  hideOrgCard,
}: {
  children: ReactNode;
  /** Hide “Change” on register flow */
  hideOrgChange?: boolean;
  /** Hide workspace card on login / forgot-password (redundant next to wordmark) */
  hideOrgCard?: boolean;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoEmoji}>⛺</Text>
            </View>
            <Text style={styles.wordmark}>Campsite</Text>
          </View>
          {hideOrgCard ? null : <AuthOrgCardMobile hideChange={hideOrgChange} />}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: authColors.shellBg },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: authColors.marketingBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 18 },
  wordmark: {
    fontSize: 22,
    letterSpacing: -0.5,
    fontWeight: '500',
    color: authColors.panelText,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  orgCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: authRadii.card,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.surface,
  },
  orgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: authColors.marketingBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgAvatarText: { color: authColors.cream, fontSize: 11, fontWeight: '700' },
  orgTextWrap: { flex: 1, minWidth: 0 },
  orgTitle: { fontSize: 13, fontWeight: '600', color: authColors.panelText },
  orgSub: { fontSize: 11.5, color: authColors.muted, marginTop: 2 },
  orgChangeHit: { paddingVertical: 4, paddingHorizontal: 8 },
  orgChange: { fontSize: 12, color: authColors.muted },
});
