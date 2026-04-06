import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import {
  CampsiteFloatingTabBar,
  campsiteAndroidFloatingTabBarSlotHeight,
} from '@/components/shell/CampsiteFloatingTabBar';

/**
 * Android: one floating pill tab bar (custom JS). iOS: `_layout.ios.tsx` native tabs.
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = campsiteAndroidFloatingTabBarSlotHeight(insets.bottom);

  return (
    <Tabs
      tabBar={(props) => <CampsiteFloatingTabBar {...props} />}
      screenOptions={{
        /** Helps tab scenes pass a bounded height to flex + FlatList children on Android. */
        sceneStyle: { flex: 1 },
        headerShown: true,
        header: () => <AppMobileHeader />,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: tabBarHeight,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="broadcasts" options={{ title: 'Broadcasts', tabBarLabel: 'Broadcasts' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarLabel: 'Calendar' }} />
      <Tabs.Screen name="rota" options={{ title: 'Rota', tabBarLabel: 'Rota' }} />
      <Tabs.Screen name="discount" options={{ title: 'Discount', tabBarLabel: 'Discount' }} />
      <Tabs.Screen name="hr" options={{ title: 'My HR', tabBarLabel: 'My HR' }} />
    </Tabs>
  );
}
