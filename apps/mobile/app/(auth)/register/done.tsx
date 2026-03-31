import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthChrome } from '@/components/auth/AuthChrome';
import { authColors, authRadii } from '@/constants/authTheme';

export default function RegisterDoneScreen() {
  return (
    <AuthChrome hideOrgChange>
      <View style={styles.center}>
        <Text style={styles.title}>Awaiting approval</Text>
        <Text style={styles.sub}>
          Thanks for registering. A manager will review your account - you&apos;ll get an email when
          you&apos;re approved.
        </Text>
        <View style={styles.box}>
          <Text style={styles.boxText}>
            You can close the app and come back after you receive confirmation. If you verified your
            email, you may already be signed in.
          </Text>
        </View>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.btnGhost}>
            <Text style={styles.btnGhostText}>Back to sign in</Text>
          </Pressable>
        </Link>
      </View>
    </AuthChrome>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 16 },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    color: authColors.panelText,
    fontFamily: 'Georgia',
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    fontSize: 14,
    lineHeight: 22,
    color: authColors.subText,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 340,
  },
  box: {
    width: '100%',
    padding: 16,
    borderRadius: authRadii.card,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.surface,
    marginBottom: 24,
  },
  boxText: { fontSize: 13, lineHeight: 20, color: authColors.subText },
  btnGhost: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { fontSize: 15, fontWeight: '500', color: authColors.panelText },
});
