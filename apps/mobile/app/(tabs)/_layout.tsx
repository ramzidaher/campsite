import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCampsiteTheme } from '@campsite/ui';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { mainShell } from '@/constants/mainShell';

type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabBarIcon({
  name,
  focused,
  activeColor,
  inactiveColor,
}: {
  name: TabIconName;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={22}
      color={focused ? activeColor : inactiveColor}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { tokens, scheme } = useCampsiteTheme();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 6);
  const tabBarHeight = 48 + bottomInset;

  const active = scheme === 'dark' ? tokens.textPrimary : mainShell.pageText;
  const inactive = tokens.textSecondary;
  const barBg = scheme === 'dark' ? tokens.surface : mainShell.topBarBg;
  const borderTop = scheme === 'dark' ? tokens.border : mainShell.border;

  const icon = (name: TabIconName, outline: TabIconName) => ({
    focused,
  }: {
    focused: boolean;
  }) => (
    <TabBarIcon
      name={focused ? name : outline}
      focused={focused}
      activeColor={active}
      inactiveColor={inactive}
    />
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <AppMobileHeader />,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: barBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: borderTop,
          height: tabBarHeight,
          paddingBottom: bottomInset,
          paddingTop: 2,
          ...(Platform.OS === 'android'
            ? { elevation: 4 }
            : {
                shadowColor: '#121212',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
              }),
        },
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: icon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="broadcasts"
        options={{
          title: 'Broadcasts',
          tabBarLabel: 'Broadcasts',
          tabBarIcon: icon('bullhorn', 'bullhorn-outline'),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarLabel: 'Calendar',
          tabBarIcon: icon('calendar-month', 'calendar-month-outline'),
        }}
      />
      <Tabs.Screen
        name="rota"
        options={{
          title: 'Rota',
          tabBarLabel: 'Rota',
          tabBarIcon: icon('calendar-clock', 'calendar-clock-outline'),
        }}
      />
      <Tabs.Screen
        name="discount"
        options={{
          title: 'Discount',
          tabBarLabel: 'Discount',
          tabBarIcon: icon('ticket-percent', 'ticket-percent-outline'),
        }}
      />
      <Tabs.Screen
        name="hr"
        options={{
          title: 'My HR',
          tabBarLabel: 'My HR',
          tabBarIcon: icon('briefcase', 'briefcase-outline'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 0,
    letterSpacing: 0.12,
  },
  tabItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
});
