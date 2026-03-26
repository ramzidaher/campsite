import { StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { mainShell } from '@/constants/mainShell';

export default function CalendarScreen() {
  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: mainShell.pageBg }]}>
        <Text style={styles.sub}>Shifts, events, and Google sync — Phase 3 (parity with web Calendar).</Text>
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20 },
  sub: { fontSize: 14, lineHeight: 21, color: mainShell.textSecondary },
});
