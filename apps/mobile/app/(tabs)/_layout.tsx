import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCampsiteTheme } from '@campsite/ui';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMobileHeader } from '@/components/shell/AppMobileHeader';
import { mainShell } from '@/constants/mainShell';
import { useUiSound } from '@/lib/sound/useUiSound';

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
    <View style={styles.iconWrapper}>
      {/* Notch indicator above the active icon */}
      <View style={[styles.notch, focused ? styles.notchVisible : styles.notchHidden]} />
      <MaterialCommunityIcons
        name={name}
        size={22}
        color={focused ? activeColor : inactiveColor}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { tokens, scheme } = useCampsiteTheme();
  const playUiSound = useUiSound();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 6);
  const tabBarHeight = 56 + bottomInset;

  const active = scheme === 'dark' ? tokens.textPrimary : mainShell.pageText;
  const inactive = scheme === 'dark' ? tokens.textMuted : '#b0b0b0';
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
        // Remove the default grey pill background indicator
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarStyle: {
          backgroundColor: barBg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: borderTop,
          height: tabBarHeight,
          paddingBottom: bottomInset,
          paddingTop: 0,
          ...(Platform.OS === 'android'
            ? { elevation: 4 }
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
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
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
      <Tabs.Screen
        name="broadcasts"
        options={{
          title: 'Broadcasts',
          tabBarLabel: 'Feed',
          tabBarIcon: icon('bullhorn', 'bullhorn-outline'),
        }}
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarLabel: 'Calendar',
          tabBarIcon: icon('calendar-month', 'calendar-month-outline'),
        }}
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
      <Tabs.Screen
        name="rota"
        options={{
          title: 'Rota',
          tabBarLabel: 'Rota',
          tabBarIcon: icon('clock-time-four', 'clock-time-four-outline'),
        }}
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
      <Tabs.Screen
        name="discount"
        options={{
          title: 'Discount',
          tabBarLabel: 'Discount',
          tabBarIcon: icon('tag', 'tag-outline'),
        }}
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
      <Tabs.Screen
        name="hr"
        options={{
          title: 'My HR',
          tabBarLabel: 'HR',
          tabBarIcon: icon('briefcase', 'briefcase-outline'),
        }}
        listeners={{ tabPress: () => playUiSound('menu_open') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  notch: {
    position: 'absolute',
    top: 0,
    width: 20,
    height: 3,
    borderRadius: 2,
  },
  notchVisible: {
    backgroundColor: mainShell.pageText,
  },
  notchHidden: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 0,
    paddingBottom: 0,
    justifyContent: 'center',
  },
});
