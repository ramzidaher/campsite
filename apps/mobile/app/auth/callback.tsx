import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authColors } from '@/constants/authTheme';
import { useAuth } from '@/lib/AuthContext';

/** Deep-link target for email confirmation / password recovery (tokens handled in AuthProvider). */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (session) {
      router.replace('/(tabs)');
      return;
    }
    const t = setTimeout(() => router.replace('/(auth)/login'), 1200);
    return () => clearTimeout(t);
  }, [loading, session, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={authColors.marketingBg} />
        <Text style={styles.text}>Signing you in…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: authColors.shellBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { fontSize: 15, color: authColors.subText },
});
