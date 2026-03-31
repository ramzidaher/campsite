import { StyleSheet, Text, View } from 'react-native';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import { mainShell } from '@/constants/mainShell';

export default function DiscountScreen() {
  return (
    <TabSafeScreen>
      <View style={[styles.screen, { backgroundColor: mainShell.pageBg }]}>
        <Text style={styles.sub}>Staff discount QR - Phase 4 (parity with web Discount Card).</Text>
      </View>
    </TabSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20 },
  sub: { fontSize: 14, lineHeight: 21, color: mainShell.textSecondary },
});
