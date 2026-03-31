import { useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authColors, authRadii } from '@/constants/authTheme';

const PAGE_BG = '#faf9f6';
const BORDER_LIGHT = '#ebe9e6';
const EYEBROW_BORDER = '#e8e6e3';
const MUTED = '#8a8a8a';
const BODY = '#5c5c5c';

export function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoEmoji}>⛺</Text>
          </View>
          <Text style={styles.wordmark}>Campsite</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.eyebrow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrowText}>COMMON GROUND STUDIOS</Text>
          </View>
          <Text style={styles.h1}>
            Your union,{'\n'}
            <Text style={styles.h1Muted}>
              <Text style={styles.h1Em}>connected</Text> and organised.
            </Text>
          </Text>
          <Text style={styles.lead}>
            A calm, focused workspace for staff comms and day-to-day operations - built for student
            unions who expect better than a group chat and a spreadsheet.
          </Text>
          <View style={styles.heroCtas}>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.btnPrimaryText}>Register</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.btnSecondaryText}>Login</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `${BORDER_LIGHT}cc`,
    backgroundColor: `${PAGE_BG}cc`,
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
    fontSize: 20,
    letterSpacing: -0.5,
    fontWeight: '500',
    color: authColors.panelText,
    fontFamily: serif,
  },
  pressed: { opacity: 0.92 },
  hero: { paddingHorizontal: 20, paddingTop: 24, maxWidth: 520, alignSelf: 'center', width: '100%' },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: authRadii.pill,
    borderWidth: 1,
    borderColor: EYEBROW_BORDER,
    backgroundColor: '#ffffff99',
    marginBottom: 20,
  },
  eyebrowDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: authColors.success,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
    color: MUTED,
  },
  h1: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: authColors.panelText,
    fontFamily: serif,
    fontWeight: '400',
  },
  h1Muted: { color: '#3d3d3d' },
  h1Em: { fontStyle: 'italic', color: '#525252', fontFamily: serif },
  lead: {
    marginTop: 20,
    fontSize: 16,
    lineHeight: 24,
    color: BODY,
  },
  heroCtas: { marginTop: 28, gap: 12 },
  btnPrimary: {
    height: 52,
    borderRadius: authRadii.button,
    backgroundColor: authColors.marketingBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '500', color: authColors.cream },
  btnSecondary: {
    height: 52,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: '#d8d6d2',
    backgroundColor: authColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '500', color: authColors.panelText },
});
