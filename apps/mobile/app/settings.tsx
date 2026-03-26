import { isApproverRole } from '@campsite/types';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { mainShell } from '@/constants/mainShell';
import { useAuth } from '@/lib/AuthContext';

function roleLabel(role: string): string {
  const m: Record<string, string> = {
    org_admin: 'Org admin',
    super_admin: 'Org admin',
    manager: 'Manager',
    coordinator: 'Coordinator',
    administrator: 'Administrator',
    duty_manager: 'Duty manager',
    csa: 'CSA',
    society_leader: 'Society leader',
  };
  return m[role] ?? role;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const showApprovals = profile?.role ? isApproverRole(profile.role) : false;

  return (
    <View style={styles.root}>
      <AppMobileHeader />
      <ScrollView
        style={[styles.screen, { backgroundColor: mainShell.pageBg }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text style={styles.name}>{profile?.full_name?.trim() || 'Member'}</Text>
          {user?.email ? <Text style={styles.meta}>{user.email}</Text> : null}
          {profile?.role ? (
            <Text style={styles.meta}>{roleLabel(profile.role)}</Text>
          ) : null}
        </View>

        {showApprovals ? (
          <Pressable
            style={styles.row}
            onPress={() => router.push('/pending-approvals')}
          >
            <Text style={styles.rowIcon}>⏳</Text>
            <Text style={styles.rowText}>Pending approvals</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ) : null}

        <Text style={styles.section}>Account</Text>
        <Text style={styles.hint}>
          Notification preferences and more will match web Settings in a later phase.
        </Text>

        <Pressable
          style={styles.signOut}
          onPress={() => {
            void signOut().then(() => router.replace('/(auth)/login'));
          }}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: mainShell.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mainShell.border,
    padding: 16,
    marginBottom: 20,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: mainShell.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  name: { fontSize: 18, fontWeight: '600', color: mainShell.pageText },
  meta: { fontSize: 14, color: mainShell.textSecondary, marginTop: 4 },
  section: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: mainShell.textMuted,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 8,
  },
  hint: { fontSize: 14, lineHeight: 21, color: mainShell.textSecondary, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  rowIcon: { fontSize: 18 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500', color: mainShell.pageText },
  chev: { fontSize: 18, color: mainShell.textMuted },
  signOut: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mainShell.border,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: '#b91c1c' },
});
