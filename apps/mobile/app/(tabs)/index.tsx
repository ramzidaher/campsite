import { Card, EmptyState, useCampsiteTheme } from '@campsite/ui';
import { StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';

export default function DashboardScreen() {
  const { tokens } = useCampsiteTheme();

  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <Text style={[styles.sub, { color: tokens.textSecondary }]}>
          Your overview — same entry as web Dashboard. Wire KPIs, shortcuts, and recent broadcasts next.
        </Text>
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>Welcome to Campsite</Text>
          <Text style={[styles.cardBody, { color: tokens.textSecondary }]}>
            Navigation matches the web sidebar: Dashboard, Broadcasts, Calendar, Rota, and Discount Card.
          </Text>
        </Card>
        <EmptyState
          title="Nothing here yet"
          description="Subscribe to departments and categories once onboarding is live."
        />
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, gap: 12 },
  sub: { fontSize: 14, lineHeight: 21 },
  card: { marginTop: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { marginTop: 8, fontSize: 14 },
});
