import { StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { mainShell } from '@/constants/mainShell';

export default function RotaScreen() {
  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: mainShell.pageBg }]}>
        <Text style={styles.sub}>Sheets import and schedules — Phase 3 (parity with web Rota).</Text>
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20 },
  sub: { fontSize: 14, lineHeight: 21, color: mainShell.textSecondary },
});
