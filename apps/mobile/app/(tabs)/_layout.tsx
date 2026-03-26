import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';

const androidAccent = '#1D4ED8';
const androidBarBg = '#ffffff';
const androidBorder = 'rgba(15, 23, 42, 0.08)';

type TabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabBarIcon({ name, focused }: { name: TabIconName; focused: boolean }) {
  return (
    <MaterialCommunityIcons
      name={name}
      size={22}
      color={focused ? androidAccent : '#64748b'}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 6);

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <AppMobileHeader />,
        tabBarStyle: {
          backgroundColor: androidBarBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: androidBorder,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
        tabBarActiveTintColor: androidAccent,
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={focused ? 'view-dashboard' : 'view-dashboard-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="broadcasts"
        options={{
          title: 'Broadcasts',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={focused ? 'bullhorn' : 'bullhorn-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rota"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={focused ? 'calendar-clock' : 'calendar-clock-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="discount"
        options={{
          title: 'Discount',
          tabBarLabel: 'Discount',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name={focused ? 'ticket-percent' : 'ticket-percent-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 2,
  },
});
