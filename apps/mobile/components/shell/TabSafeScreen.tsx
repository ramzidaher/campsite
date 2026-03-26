import { type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';

/** iOS native tabs do not use JS `Tabs` headers; Android still gets `header` from `_layout.tsx`. */
export function TabSafeScreen({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') {
    return <>{children}</>;
  }
  return (
    <View style={{ flex: 1 }}>
      <AppMobileHeader />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
