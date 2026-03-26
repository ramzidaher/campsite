import { Card, EmptyState, useCampsiteTheme } from '@campsite/ui';
import { StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';

export default function BroadcastsScreen() {
  const { tokens } = useCampsiteTheme();

  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <Text style={[styles.lead, { color: tokens.textSecondary }]}>
          Broadcasts from your organisation — same feed as the web app. Wire to Supabase + FlashList next.
        </Text>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>No broadcasts loaded</Text>
          <Text style={[styles.cardBody, { color: tokens.textSecondary }]}>
            Pull to refresh and mark-as-read will match web behaviour once the API is connected.
          </Text>
        </Card>
        <EmptyState
          title="Nothing new"
          description="When your team posts updates, they will appear here."
        />
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 16 },
  lead: { fontSize: 14, lineHeight: 21 },
  card: { marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 8, fontSize: 14, lineHeight: 20 },
});
