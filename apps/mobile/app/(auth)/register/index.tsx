import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthChrome } from '@/components/auth/AuthChrome';
import { RegisterWizard } from '@/components/auth/RegisterWizard';
import { authColors } from '@/constants/authTheme';

const extra = Constants.expoConfig?.extra as { orgSlug?: string } | undefined;

export default function RegisterScreen() {
  const initialOrgSlug = extra?.orgSlug?.trim() || null;

  return (
    <AuthChrome hideOrgChange>
      <RegisterWizard initialOrgSlug={initialOrgSlug} />
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable>
            <Text style={styles.link}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    </AuthChrome>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: { fontSize: 13, color: authColors.subText },
  link: {
    fontSize: 13,
    fontWeight: '600',
    color: authColors.panelText,
    textDecorationLine: 'underline',
  },
});
