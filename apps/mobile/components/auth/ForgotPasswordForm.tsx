import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authColors, authRadii } from '@/constants/authTheme';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const configured = isSupabaseConfigured();

  async function submit() {
    if (!configured || !email.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      const redirectTo = Linking.createURL('auth/callback');
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return <Text style={styles.error}>Configure Supabase to reset your password.</Text>;
  }

  if (sent) {
    return (
      <View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.sub}>
          If an account exists for <Text style={styles.emph}>{email.trim()}</Text>, we sent a reset link.
          Open it on this device to return to the app.
        </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.btnGhost}>
            <Text style={styles.btnGhostText}>Back to sign in</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <View>
      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      </Link>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.sub}>Enter your email and we&apos;ll send you a reset link</Text>
      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@organisation.ac.uk"
        placeholderTextColor={authColors.muted}
      />
      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Pressable
        style={[styles.btnPrimary, loading && styles.btnDisabled]}
        disabled={loading}
        onPress={() => void submit()}
      >
        {loading ? <ActivityIndicator color={authColors.cream} /> : null}
        <Text style={styles.btnPrimaryText}>Send reset link</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { marginBottom: 24, alignSelf: 'flex-start' },
  backText: { fontSize: 13, color: authColors.muted },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    color: authColors.panelText,
    fontFamily: 'Georgia',
    marginBottom: 8,
  },
  sub: { fontSize: 14, lineHeight: 22, color: authColors.subText, marginBottom: 32 },
  emph: { fontWeight: '600', color: authColors.panelText },
  label: { fontSize: 13, fontWeight: '500', color: authColors.subText, marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: authRadii.input,
    borderWidth: 1,
    borderColor: authColors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: authColors.panelText,
    backgroundColor: authColors.white,
    marginBottom: 16,
  },
  error: { fontSize: 14, color: authColors.error, marginBottom: 16 },
  btnPrimary: {
    height: 46,
    borderRadius: authRadii.button,
    backgroundColor: authColors.marketingBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: { fontSize: 15, fontWeight: '500', color: authColors.cream },
  btnGhost: {
    marginTop: 24,
    height: 46,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { fontSize: 15, fontWeight: '500', color: authColors.panelText },
});
