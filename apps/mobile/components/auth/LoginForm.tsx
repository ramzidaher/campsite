import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authColors, authRadii } from '@/constants/authTheme';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type ViewMode = 'login' | 'magic' | 'magic-sent';

function pillStyle(active: boolean) {
  return [styles.pill, active ? styles.pillActive : styles.pillIdle];
}

export function LoginForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string }>();
  const configured = isSupabaseConfigured();

  const [mode, setMode] = useState<ViewMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.error === 'inactive' ? 'Your account is inactive.' : null
  );

  function goLogin() {
    setMode('login');
    setMessage(null);
  }

  async function onSubmit() {
    if (!configured) return;
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      if (!keepSignedIn) {
        /* session still persisted by Supabase; checkbox is UX parity with web */
      }
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    if (!configured) return;
    if (!email.trim()) {
      setMessage('Enter your email address.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      const redirectTo = Linking.createURL('auth/callback');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMode('magic-sent');
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.sub}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your env and restart Expo.
        </Text>
      </View>
    );
  }

  if (mode === 'magic') {
    return (
      <View style={styles.block}>
        <Pressable onPress={goLogin} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Magic link</Text>
        <Text style={styles.sub}>
          Enter your email and we&apos;ll send you a sign-in link — no password needed
        </Text>
        <Text style={styles.label}>Email address</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@organisation.ac.uk"
          placeholderTextColor={authColors.muted}
          style={[styles.input, message ? styles.inputError : null]}
        />
        {message ? (
          <Text style={styles.error} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}
        <Pressable
          style={[styles.btnPrimary, loading && styles.btnDisabled]}
          onPress={() => void sendMagicLink()}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={authColors.cream} /> : null}
          <Text style={styles.btnPrimaryText}>Send magic link</Text>
        </Pressable>
        <Pressable onPress={goLogin} style={styles.centerLink}>
          <Text style={styles.link}>Use password instead</Text>
        </Pressable>
      </View>
    );
  }

  if (mode === 'magic-sent') {
    return (
      <View style={styles.blockCenter}>
        <View style={styles.mailIcon}>
          <Text style={styles.mailEmoji}>✉️</Text>
        </View>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.subCenter}>
          A magic sign-in link has been sent to{'\n'}
          <Text style={styles.emph}>{email.trim()}</Text>
        </Text>
        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            The link expires in about an hour. Open the email on this device and tap the link to return
            to the app.
          </Text>
        </View>
        <Pressable
          style={styles.btnGhost}
          onPress={() => {
            goLogin();
            setMessage(null);
          }}
        >
          <Text style={styles.btnGhostText}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={styles.pillRow}>
        <Pressable onPress={goLogin} style={pillStyle(true)}>
          <Text style={[styles.pillText, styles.pillTextActive]}>Password</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('magic');
            setMessage(null);
          }}
          style={pillStyle(false)}
        >
          <Text style={styles.pillText}>Magic link</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.sub}>Sign in to your Campsite account</Text>

      <Text style={styles.label}>Email address</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="you@organisation.ac.uk"
        placeholderTextColor={authColors.muted}
        style={styles.input}
      />

      <View style={styles.pwRow}>
        <Text style={styles.label}>Password</Text>
        <Link href="/(auth)/forgot-password" asChild>
          <Pressable>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
        </Link>
      </View>
      <View>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPw}
          autoComplete="password"
          placeholder="Enter your password"
          placeholderTextColor={authColors.muted}
          style={[styles.input, styles.inputPw]}
        />
        <Pressable style={styles.showPw} onPress={() => setShowPw((s) => !s)}>
          <Text style={styles.showPwText}>{showPw ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.checkRow}
        onPress={() => setKeepSignedIn((k) => !k)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: keepSignedIn }}
      >
        <View style={[styles.checkbox, keepSignedIn && styles.checkboxOn]}>
          {keepSignedIn ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkLabel}>Keep me signed in on this device</Text>
      </Pressable>

      {message ? (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}

      <Pressable
        style={[styles.btnPrimary, loading && styles.btnDisabled]}
        onPress={() => void onSubmit()}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color={authColors.cream} /> : null}
        <Text style={styles.btnPrimaryText}>Sign in</Text>
      </Pressable>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={styles.btnGhost}
        onPress={() => {
          setMode('magic');
          setMessage(null);
        }}
      >
        <Text style={styles.btnGhostText}>✉️ Continue with magic link</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don&apos;t have an account? </Text>
        <Link href="/(auth)/register" asChild>
          <Pressable style={styles.createBtn}>
            <Text style={styles.createBtnText}>Create one</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingBottom: 24 },
  blockCenter: { alignItems: 'center', paddingBottom: 24 },
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
  subCenter: {
    fontSize: 14,
    lineHeight: 22,
    color: authColors.subText,
    marginBottom: 8,
    textAlign: 'center',
  },
  emph: { fontWeight: '600', color: authColors.panelText },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: authColors.subText,
    marginBottom: 6,
  },
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
  inputError: { borderColor: authColors.error },
  inputPw: { paddingRight: 56, marginBottom: 16 },
  pwRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  forgot: { fontSize: 12.5, color: authColors.muted },
  showPw: { position: 'absolute', right: 12, top: 12 },
  showPwText: { fontSize: 13, color: authColors.muted },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: authColors.border,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: authColors.marketingBg, borderColor: authColors.marketingBg },
  checkMark: { color: authColors.cream, fontSize: 11, fontWeight: '700' },
  checkLabel: { flex: 1, fontSize: 12.5, lineHeight: 18, color: authColors.subText },
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
    height: 46,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { fontSize: 15, fontWeight: '500', color: authColors.panelText },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: authColors.border },
  dividerText: { fontSize: 12, color: authColors.muted },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  pill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: authRadii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { borderColor: authColors.marketingBg, backgroundColor: authColors.marketingBg },
  pillIdle: { borderColor: authColors.border, backgroundColor: '#f0efec' },
  pillText: { fontSize: 13, fontWeight: '500', color: authColors.subText },
  pillTextActive: { color: authColors.cream },
  centerLink: { marginTop: 16, alignSelf: 'center' },
  link: {
    fontSize: 14,
    fontWeight: '500',
    color: authColors.panelText,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: { fontSize: 13, color: authColors.subText },
  createBtn: {
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  createBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: authColors.panelText,
    textDecorationLine: 'underline',
  },
  mailIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: authColors.skyTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  mailEmoji: { fontSize: 28 },
  hintBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: authRadii.card,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.surface,
  },
  hintText: { fontSize: 13, lineHeight: 20, color: authColors.subText },
});
