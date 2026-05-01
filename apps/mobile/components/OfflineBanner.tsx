import { useCampsiteTheme } from '@campsite/ui';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { mainShell, mainShellText } from '@/constants/mainShell';

export function OfflineBanner() {
  const { tokens } = useCampsiteTheme();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false);
    });
  }, []);

  if (!offline) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: tokens.surface, borderLeftColor: tokens.warning }]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Showing cached data where available."
    >
      <Text style={[styles.text, { color: tokens.textPrimary }]}>
        You&apos;re offline - showing cached data where available.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: mainShell.spacing.xs + 2,
    paddingHorizontal: mainShell.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
  },
  text: {
    ...mainShellText.body,
    textAlign: 'center',
  },
});
