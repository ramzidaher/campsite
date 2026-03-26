import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authColors, authRadii } from '@/constants/authTheme';
import { useAuth } from '@/lib/AuthContext';

export default function PendingScreen() {
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.inner}>
        <Text style={styles.title}>Awaiting approval</Text>
        <Text style={styles.sub}>
          Your account is pending manager approval. We&apos;ll email you when you can use Campsite.
        </Text>
        <View style={styles.box}>
          <Text style={styles.boxText}>
            Pull to refresh the app after you&apos;re approved, or sign out and sign in again.
          </Text>
        </View>
        <Pressable
          style={styles.btnGhost}
          onPress={() => {
            void signOut();
          }}
        >
          <Text style={styles.btnGhostText}>Sign out</Text>
        </Pressable>
        <Link href="/(tabs)" asChild>
          <Pressable style={styles.linkBtn}>
            <Text style={styles.linkText}>Try home again</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: authColors.shellBg },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Georgia',
    color: authColors.panelText,
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
    color: authColors.subText,
    textAlign: 'center',
    marginBottom: 24,
  },
  box: {
    padding: 16,
    borderRadius: authRadii.card,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.surface,
    marginBottom: 20,
  },
  boxText: { fontSize: 13, lineHeight: 20, color: authColors.subText, textAlign: 'center' },
  btnGhost: {
    height: 46,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  btnGhostText: { fontSize: 15, fontWeight: '500', color: authColors.panelText },
  linkBtn: { padding: 12, alignItems: 'center' },
  linkText: { fontSize: 14, color: authColors.panelText, textDecorationLine: 'underline' },
});
