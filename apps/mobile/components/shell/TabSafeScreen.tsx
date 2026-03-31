import { type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';

/** iOS native tabs: in-screen header. Android JS tabs: header + tab bar from `Tabs` (reserved height). */
export function TabSafeScreen({ children }: { children: ReactNode }) {
  if (Platform.OS === 'ios') {
    return (
      <View style={{ flex: 1 }}>
        <AppMobileHeader />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  /** Same flex root as iOS body so tab screens (e.g. FlatList flex:1) get a bounded height on Android. */
  return <View style={{ flex: 1 }}>{children}</View>;
}
